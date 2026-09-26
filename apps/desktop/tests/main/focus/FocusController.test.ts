// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {FocusController} from "../../../src/main/focus/FocusController"

const electron = vi.hoisted(() => ({
  focusedWindow: null,
  notifications: [],
  powerHandlers: new Map(),
  quit: vi.fn(),
}))

vi.mock("electron", () => ({
  app: {quit: electron.quit},
  BrowserWindow: {getFocusedWindow: () => electron.focusedWindow},
  Notification: class {
    constructor(options) {
      this.options = options
      this.isShown = false
      electron.notifications.push(this)
    }

    show() {
      this.isShown = true
    }
  },
  powerMonitor: {on: (event, handler) => electron.powerHandlers.set(event, handler)},
}))

vi.mock("@daily/core", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {TASKS: "TASKS"}},
}))

const T0 = new Date("2026-09-26T10:00:00.000Z")

function makeTask(overrides = {}) {
  return {
    id: "t1",
    content: "# Write the **report**\nwith charts",
    status: "active",
    spentTime: 100,
    deletedAt: null,
    ...overrides,
  }
}

function makeStorage(tasks) {
  const rows = new Map(tasks.map((task) => [task.id, {...task}]))

  return {
    rows,
    getTask: vi.fn(async (id) => (rows.has(id) ? {...rows.get(id)} : null)),
    updateTask: vi.fn(async (id, updates) => {
      rows.set(id, {...rows.get(id), ...updates})
      return {tasks: {upserted: [{...rows.get(id)}]}}
    }),
  }
}

async function startedController(tasks = [makeTask()], mode = "pomodoro-25") {
  const storage = makeStorage(tasks)
  const broadcast = vi.fn()
  const focus = new FocusController(storage, broadcast)

  await focus.dispatch({type: "set-mode", mode})
  for (const [index, task] of tasks.entries()) await focus.dispatch({type: "add", taskId: task.id, index})
  await focus.dispatch({type: "start"})

  return {focus, storage, broadcast}
}

describe("FocusController", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    electron.focusedWindow = null
    electron.notifications.length = 0
    electron.quit.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("adds a task with its first line as the title, and ignores a task that is missing or already resolved", async () => {
    const storage = makeStorage([makeTask(), makeTask({id: "t2", status: "done"}), makeTask({id: "t3", deletedAt: "2026-09-26T09:00:00.000Z"})])
    const focus = new FocusController(storage, vi.fn())

    await focus.dispatch({type: "add", taskId: "t1", index: 0})
    await focus.dispatch({type: "add", taskId: "t2", index: 1})
    await focus.dispatch({type: "add", taskId: "t3", index: 1})
    await focus.dispatch({type: "add", taskId: "missing", index: 1})

    expect(focus.getSession().tasks).toEqual([{taskId: "t1", title: "Write the report", focusedSeconds: 0, isDone: false}])
  })

  it("writes the interval's seconds when it ends, starts the break and broadcasts it", async () => {
    const {focus, storage, broadcast} = await startedController()

    await vi.advanceTimersByTimeAsync(25 * 60 * 1000)

    expect(storage.rows.get("t1").spentTime).toBe(100 + 25 * 60)
    expect(focus.getSession()).toMatchObject({phase: "break", completedIntervals: 1})
    expect(broadcast).toHaveBeenLastCalledWith(focus.getSession())
  })

  it("goes back to focus on the same task when the break ends", async () => {
    const {focus} = await startedController()

    await vi.advanceTimersByTimeAsync(25 * 60 * 1000)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1)
    expect(focus.getSession().phase).toBe("break")

    await vi.advanceTimersByTimeAsync(1)
    expect(focus.getSession()).toMatchObject({
      phase: "focus",
      currentTaskId: "t1",
      runStartedAt: new Date(T0.getTime() + 30 * 60 * 1000).toISOString(),
    })
  })

  it("writes Done's status and focus time in one update, as a manual change", async () => {
    const {focus, storage} = await startedController([makeTask(), makeTask({id: "t2"})])

    await vi.advanceTimersByTimeAsync(90 * 1000)
    const session = await focus.dispatch({type: "done"})

    expect(storage.updateTask).toHaveBeenCalledTimes(1)
    expect(storage.updateTask).toHaveBeenCalledWith("t1", {spentTime: 190, status: "done"}, {kind: "manual"})
    expect(storage.rows.get("t1")).toMatchObject({spentTime: 190, status: "done"})
    expect(session.currentTaskId).toBe("t2")
  })

  it("writes the time on Pause and leaves no timer pending", async () => {
    const {focus, storage} = await startedController()

    await vi.advanceTimersByTimeAsync(40 * 1000)
    await focus.dispatch({type: "pause"})

    expect(storage.rows.get("t1").spentTime).toBe(140)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("holds a quit during focus until the running stretch is written, quits again only after the held quit returns, and lets that quit through", async () => {
    const {focus, storage} = await startedController()
    await vi.advanceTimersByTimeAsync(40 * 1000)
    const landWrite = storage.updateTask.getMockImplementation()
    let releaseWrite
    storage.updateTask.mockImplementationOnce((...args) => new Promise((resolve) => (releaseWrite = () => resolve(landWrite(...args)))))

    const firstQuit = {preventDefault: vi.fn()}
    expect(focus.holdQuit(firstQuit)).toBe(true)
    expect(firstQuit.preventDefault).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0)
    expect(electron.quit).not.toHaveBeenCalled()

    releaseWrite()
    for (let turn = 0; turn < 50; turn++) await new Promise((resolve) => process.nextTick(resolve))
    expect(storage.rows.get("t1").spentTime).toBe(140)
    expect(electron.quit).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(0)
    expect(electron.quit).toHaveBeenCalledTimes(1)

    const secondQuit = {preventDefault: vi.fn()}
    expect(focus.holdQuit(secondQuit)).toBe(false)
    expect(secondQuit.preventDefault).not.toHaveBeenCalled()
    expect(storage.updateTask).toHaveBeenCalledTimes(1)
  })

  describe("storage changes from elsewhere", () => {
    it("moves on to the next task and writes nothing when the current task is deleted mid-focus", async () => {
      const {focus, storage} = await startedController([makeTask(), makeTask({id: "t2"})])

      await vi.advanceTimersByTimeAsync(60 * 1000)
      focus.applyStorageChange({tasks: {removed: ["t1"]}})
      await vi.advanceTimersByTimeAsync(0)

      expect(storage.updateTask).not.toHaveBeenCalled()
      expect(focus.getSession()).toMatchObject({currentTaskId: "t2", runStartedAt: new Date(T0.getTime() + 60 * 1000).toISOString()})
      expect(focus.getSession().tasks.map((task) => task.taskId)).toEqual(["t2"])
    })

    it("treats a session task that arrives upserted with deletedAt as deleted, and writes nothing", async () => {
      const {focus, storage} = await startedController([makeTask(), makeTask({id: "t2"})])

      await vi.advanceTimersByTimeAsync(60 * 1000)
      focus.applyStorageChange({tasks: {upserted: [makeTask({deletedAt: "2026-09-26T10:01:00.000Z"})]}})
      await vi.advanceTimersByTimeAsync(0)

      expect(storage.updateTask).not.toHaveBeenCalled()
      expect(focus.getSession()).toMatchObject({currentTaskId: "t2"})
      expect(focus.getSession().tasks.map((task) => task.taskId)).toEqual(["t2"])
    })

    it("writes the current task's time before it leaves when it is discarded elsewhere", async () => {
      const {focus, storage} = await startedController([makeTask(), makeTask({id: "t2"})])

      await vi.advanceTimersByTimeAsync(60 * 1000)
      focus.applyStorageChange({tasks: {upserted: [makeTask({status: "discarded"})]}})
      await vi.advanceTimersByTimeAsync(0)

      expect(storage.updateTask).toHaveBeenCalledWith("t1", {spentTime: 160}, {kind: "manual"})
      expect(storage.rows.get("t1").status).toBe("active")
      expect(focus.getSession().currentTaskId).toBe("t2")
    })

    it("goes to the summary when the last unfinished task leaves", async () => {
      const {focus} = await startedController([makeTask(), makeTask({id: "t2"})])

      await focus.dispatch({type: "done"})
      focus.applyStorageChange({tasks: {upserted: [makeTask({id: "t2", status: "done"})]}})

      expect(focus.getSession()).toMatchObject({phase: "summary", currentTaskId: null})
      expect(focus.getSession().tasks.map((task) => task.taskId)).toEqual(["t1"])
    })

    it("keeps every row of the summary when a task in it is discarded or deleted elsewhere", async () => {
      const {focus} = await startedController([makeTask(), makeTask({id: "t2"}), makeTask({id: "t3"})])
      await focus.dispatch({type: "stop"})
      const summary = focus.getSession()

      focus.applyStorageChange({tasks: {upserted: [makeTask({id: "t2", status: "discarded"})], removed: ["t3"]}})

      expect(focus.getSession()).toBe(summary)
      expect(summary.tasks.map((task) => task.taskId)).toEqual(["t1", "t2", "t3"])
    })

    it("ignores the echo of its own Done", async () => {
      const {focus, storage, broadcast} = await startedController([makeTask(), makeTask({id: "t2"})])

      await vi.advanceTimersByTimeAsync(30 * 1000)
      const session = await focus.dispatch({type: "done"})
      const echo = await storage.updateTask.mock.results[0].value
      broadcast.mockClear()

      focus.applyStorageChange(echo)

      expect(focus.getSession()).toBe(session)
      expect(broadcast).not.toHaveBeenCalled()
    })

    it("follows an edit of the task's first line", async () => {
      const {focus} = await startedController()

      focus.applyStorageChange({tasks: {upserted: [makeTask({content: "- [ ] Call the bank\nabout the card"})]}})

      expect(focus.getSession().tasks[0].title).toBe("Call the bank")
    })
  })

  describe("notifications and sleep", () => {
    it("tells an app in the background that the interval is done, and that the break is over", async () => {
      await startedController([makeTask()], "pomodoro-50")

      await vi.advanceTimersByTimeAsync(50 * 60 * 1000)
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

      expect(electron.notifications.map((notification) => [notification.options, notification.isShown])).toEqual([
        [{title: "Focus interval done", body: "Take a 10-minute break.", silent: false}, true],
        [{title: "Break over", body: "Back to: Write the report", silent: false}, true],
      ])
    })

    it("shows nothing while a Daily window is focused", async () => {
      electron.focusedWindow = {}
      const {focus} = await startedController()

      await vi.advanceTimersByTimeAsync(25 * 60 * 1000)

      expect(focus.getSession().phase).toBe("break")
      expect(electron.notifications).toEqual([])
    })

    it("pauses a running focus stretch when the Mac sleeps, writing the time up to the sleep", async () => {
      const {focus, storage} = await startedController()

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      electron.powerHandlers.get("suspend")()
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

      expect(focus.getSession().phase).toBe("pause")
      expect(storage.rows.get("t1").spentTime).toBe(100 + 10 * 60)
    })

    it("ends a break that ran out during sleep as soon as the Mac wakes", async () => {
      const {focus} = await startedController()
      await vi.advanceTimersByTimeAsync(25 * 60 * 1000)

      vi.setSystemTime(Date.now() + 60 * 60 * 1000)
      electron.powerHandlers.get("resume")()
      await vi.advanceTimersByTimeAsync(0)

      expect(focus.getSession()).toMatchObject({phase: "focus", runStartedAt: new Date(T0.getTime() + 85 * 60 * 1000).toISOString()})
    })
  })
})
