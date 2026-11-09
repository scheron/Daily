import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {TaskTimersController} from "../../../../src/main/modules/task-timers/TaskTimersController"

import type {Task} from "@daily/protocol"

const START = 10_000

function makeTask(id: string, status: Task["status"] = "in_progress"): Task {
  return {id, status, deletedAt: null, spentTime: 100} as Task
}

function setup(tasks = [makeTask("first"), makeTask("second")]) {
  const rows = new Map(tasks.map((task) => [task.id, task]))
  const getTask = vi.fn(async (id: string) => rows.get(id) ?? null)
  const addTaskSpentTime = vi.fn(async (id: string, seconds: number) => {
    const row = rows.get(id)
    if (!row || row.deletedAt) return {}

    const task = {...row, spentTime: row.spentTime + seconds}
    rows.set(id, task)
    return {tasks: {upserted: [task]}}
  })
  const broadcast = vi.fn()
  const reportError = vi.fn()
  const timers = new TaskTimersController({getTask, addTaskSpentTime}, broadcast, reportError)

  return {timers, rows, getTask, addTaskSpentTime, broadcast, reportError}
}

describe("TaskTimersController", () => {
  beforeEach(() => {
    vi.useFakeTimers({toFake: ["Date", "performance", "setImmediate"]})
    vi.setSystemTime(START)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("credits elapsed time when the system clock moves forwards and backwards", async () => {
    const {timers, rows} = setup()
    await timers.dispatch({type: "start", taskId: "first"})
    vi.advanceTimersByTime(1_200)
    vi.setSystemTime(START + 3_600_000)
    await timers.dispatch({type: "pause", taskId: "first"})

    expect(rows.get("first")?.spentTime).toBe(101)
    await timers.dispatch({type: "resume", taskId: "first"})
    vi.advanceTimersByTime(1_100)
    vi.setSystemTime(START)
    await timers.dispatch({type: "stop", taskId: "first"})

    expect(rows.get("first")?.spentTime).toBe(102)
  })

  it("credits only each timer's unrecorded whole seconds, carrying fractions across Pause", async () => {
    const {timers, rows} = setup()

    await timers.dispatch({type: "start", taskId: "first"})
    vi.advanceTimersByTime(500)
    await timers.dispatch({type: "start", taskId: "second"})
    vi.advanceTimersByTime(1_250)
    await timers.dispatch({type: "pause", taskId: "first"})

    expect(rows.get("first")?.spentTime).toBe(101)
    expect(rows.get("second")?.spentTime).toBe(100)
    expect(timers.getTimers()).toEqual([
      {taskId: "first", elapsedMs: 1_750, isRunning: false},
      {taskId: "second", elapsedMs: 1_250, isRunning: true},
    ])

    vi.advanceTimersByTime(3_250)
    await timers.dispatch({type: "resume", taskId: "first"})
    vi.advanceTimersByTime(300)
    await timers.dispatch({type: "stop", taskId: "first"})
    await timers.dispatch({type: "stop", taskId: "second"})

    expect(rows.get("first")).toMatchObject({spentTime: 102, status: "in_progress"})
    expect(rows.get("second")?.spentTime).toBe(104)
    expect(timers.getTimers()).toEqual([])
  })

  it("appends new timers once and moves a selected timer ahead without resetting its clock", async () => {
    const {timers, broadcast} = setup()

    await Promise.all([timers.dispatch({type: "start", taskId: "first"}), timers.dispatch({type: "start", taskId: "first"})])
    vi.advanceTimersByTime(500)
    await timers.dispatch({type: "start", taskId: "second"})

    expect(timers.getTimers().map(({taskId}) => taskId)).toEqual(["first", "second"])
    await timers.dispatch({type: "promote", taskId: "second"})
    expect(broadcast).toHaveBeenLastCalledWith([
      {taskId: "second", elapsedMs: 0, isRunning: true},
      {taskId: "first", elapsedMs: 500, isRunning: true},
    ])
  })

  it("ignores a task that is already done and a start overtaken by a task deletion", async () => {
    const {timers, getTask} = setup([makeTask("done", "done")])

    await timers.dispatch({type: "start", taskId: "done"})
    const pendingTask = Promise.withResolvers<Task>()
    getTask.mockReturnValueOnce(pendingTask.promise)
    const start = timers.dispatch({type: "start", taskId: "deleted"})
    timers.applyStorageChange({tasks: {removed: ["deleted"]}})
    pendingTask.resolve(makeTask("deleted"))
    await start

    expect(timers.getTimers()).toEqual([])
  })

  it("freezes running timers on suspend and credits nothing for the suspended interval", async () => {
    const {timers, rows} = setup()

    await timers.dispatch({type: "start", taskId: "first"})
    await timers.dispatch({type: "start", taskId: "second"})
    vi.advanceTimersByTime(2_500)
    timers.pauseAll()
    await vi.runAllTimersAsync()
    expect(rows.get("first")?.spentTime).toBe(102)
    expect(timers.getTimers().every(({isRunning}) => !isRunning)).toBe(true)

    vi.advanceTimersByTime(22_500)
    await timers.dispatch({type: "stop", taskId: "first"})
    await timers.dispatch({type: "stop", taskId: "second"})

    expect(rows.get("first")?.spentTime).toBe(102)
    expect(rows.get("second")?.spentTime).toBe(102)
  })

  it("discards a deleted task's timer without writing time to the trash", async () => {
    const {timers, rows} = setup()

    await timers.dispatch({type: "start", taskId: "first"})
    await timers.dispatch({type: "start", taskId: "second"})
    vi.advanceTimersByTime(5_000)
    timers.applyStorageChange({tasks: {removed: ["first"]}})
    await timers.dispatch({type: "stop", taskId: "first"})

    expect(rows.get("first")?.spentTime).toBe(100)
    expect(timers.getTimers().map(({taskId}) => taskId)).toEqual(["second"])
  })

  it("finishes a done task through its in-flight Pause write and ignores the re-entrant done changeset", async () => {
    const {timers, rows, addTaskSpentTime} = setup()
    const release = Promise.withResolvers<void>()
    const save = addTaskSpentTime.getMockImplementation()!
    addTaskSpentTime.mockImplementation(async (id, seconds) => {
      await release.promise
      const changeset = await save(id, seconds)
      timers.applyStorageChange(changeset)
      return changeset
    })

    await timers.dispatch({type: "start", taskId: "first"})
    vi.advanceTimersByTime(3_200)
    const pause = timers.dispatch({type: "pause", taskId: "first"})
    const done = makeTask("first", "done")
    rows.set(done.id, done)
    timers.applyStorageChange({tasks: {upserted: [done]}})
    expect(timers.getTimers()).toEqual([{taskId: "first", elapsedMs: 3_200, isRunning: false}])

    release.resolve()
    await pause

    expect(rows.get("first")).toMatchObject({spentTime: 103, status: "done"})
    expect(timers.getTimers()).toEqual([])
  })

  it("freezes time at completion and publishes the credited task after the completion write", async () => {
    const {timers, rows} = setup()
    await timers.dispatch({type: "start", taskId: "first"})

    vi.advanceTimersByTime(2_300)
    const done = makeTask("first", "done")
    rows.set(done.id, done)
    timers.applyStorageChange({tasks: {upserted: [done]}})
    await Promise.resolve()

    expect(rows.get("first")?.spentTime).toBe(100)
    expect(timers.getTimers()).toEqual([{taskId: "first", elapsedMs: 2_300, isRunning: false}])
    vi.advanceTimersByTime(6_700)
    await vi.runAllTimersAsync()

    expect(rows.get("first")?.spentTime).toBe(102)
    expect(timers.getTimers()).toEqual([])
  })

  it("keeps an unsuccessfully saved completion paused and credits it once when Stop is retried", async () => {
    const {timers, rows, addTaskSpentTime, reportError} = setup()
    const error = new Error("busy")
    addTaskSpentTime.mockRejectedValueOnce(error)
    await timers.dispatch({type: "start", taskId: "first"})
    vi.advanceTimersByTime(3_000)
    const done = makeTask("first", "done")
    rows.set(done.id, done)
    timers.applyStorageChange({tasks: {upserted: [done]}})
    await vi.runAllTimersAsync()

    expect(reportError).toHaveBeenCalledWith(error)
    expect(timers.getTimers()).toEqual([{taskId: "first", elapsedMs: 3_000, isRunning: false}])
    await timers.dispatch({type: "resume", taskId: "first"})
    await Promise.all([timers.dispatch({type: "stop", taskId: "first"}), timers.dispatch({type: "stop", taskId: "first"})])

    expect(rows.get("first")).toMatchObject({spentTime: 103, status: "done"})
    expect(timers.getTimers()).toEqual([])
  })

  it("holds quit while a Stop writes and saves all remaining timers before retrying the quit", async () => {
    const {timers, rows, addTaskSpentTime} = setup()
    const release = Promise.withResolvers<void>()
    const save = addTaskSpentTime.getMockImplementation()!
    addTaskSpentTime.mockImplementationOnce(async (id, seconds) => {
      await release.promise
      return save(id, seconds)
    })

    await timers.dispatch({type: "start", taskId: "first"})
    await timers.dispatch({type: "start", taskId: "second"})
    vi.advanceTimersByTime(4_300)
    const stop = timers.dispatch({type: "stop", taskId: "first"})
    const quit = vi.fn()
    const event = {preventDefault: vi.fn()}
    expect(timers.holdQuit(event, quit)).toBe(true)
    expect(timers.holdQuit(event, quit)).toBe(true)
    await vi.runAllTimersAsync()

    expect(event.preventDefault).toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
    expect(rows.get("first")?.spentTime).toBe(100)
    expect(rows.get("second")?.spentTime).toBe(104)

    release.resolve()
    await stop
    await vi.runAllTimersAsync()

    expect(rows.get("first")?.spentTime).toBe(104)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(timers.holdQuit(event, quit)).toBe(false)
  })

  it("holds a failed quit and retries only the timers that did not save", async () => {
    const {timers, rows, addTaskSpentTime, reportError} = setup()
    const error = new Error("busy")
    await timers.dispatch({type: "start", taskId: "first"})
    await timers.dispatch({type: "start", taskId: "second"})
    vi.advanceTimersByTime(2_000)
    addTaskSpentTime.mockRejectedValueOnce(error)
    const quit = vi.fn()
    const event = {preventDefault: vi.fn()}

    timers.holdQuit(event, quit)
    await vi.runAllTimersAsync()

    expect(reportError).toHaveBeenCalledWith(error)
    expect(quit).not.toHaveBeenCalled()
    expect(timers.getTimers()).toEqual([{taskId: "first", elapsedMs: 2_000, isRunning: false}])
    timers.holdQuit(event, quit)
    await vi.runAllTimersAsync()

    expect(rows.get("first")?.spentTime).toBe(102)
    expect(rows.get("second")?.spentTime).toBe(102)
    expect(quit).toHaveBeenCalledTimes(1)
  })
})
