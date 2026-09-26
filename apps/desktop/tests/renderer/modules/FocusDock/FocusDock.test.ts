// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {makeColumn, makeTask, mountBoardDrag, yForIndex} from "../../../helpers/boardDrag"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

function makeSessionTask(taskId) {
  return {taskId, title: `Task ${taskId}`, focusedSeconds: 0, isDone: false}
}

describe("FocusDock", () => {
  let bridge = null
  let board = null
  let wrappers = []

  beforeEach(() => {
    bridge = mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount())
    wrappers = []
    board?.unmount()
    board = null
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  async function mountInBody(component) {
    const wrapper = mount(component, {attachTo: document.body, global: {directives: {tooltip: {}}}})
    wrappers.push(wrapper)
    await nextTick()
    return wrapper
  }

  async function setupDock() {
    const {default: FocusDock} = await import("../../../../src/renderer/src/ui/modules/FocusDock")
    const {useFocusStore} = await import("../../../../src/renderer/src/stores/focus.store")

    const focus = useFocusStore()
    await vi.waitFor(() => expect(focus.session).not.toBeNull())

    return {dock: await mountInBody(FocusDock), focus}
  }

  function mockRowRects(dock) {
    const rows = dock.findAll("[data-focus-row]")
    rows.forEach((row, index) => {
      vi.spyOn(row.element, "getBoundingClientRect").mockReturnValue({
        top: 500 + index * 40,
        bottom: 534 + index * 40,
        left: 0,
        right: 340,
        width: 340,
        height: 34,
      })
    })
    return rows
  }

  async function setupDrop(seed, sessionTaskIds) {
    board = await mountBoardDrag(seed)
    const {dock, focus} = await setupDock()
    focus.session = {...focus.session, tasks: sessionTaskIds.map(makeSessionTask)}
    board.ui.toggleFocusDock(true)
    await nextTick()

    const rows = mockRowRects(dock)

    return {dock, rows}
  }

  it("shows and hides the dock from the Focus button and never sends the session a command", async () => {
    const actionsDockPath = "../../../../src/renderer/src/ui/modules/ActionsDock/ActionsDock.vue"
    const {default: ActionsDock} = await import(/* @vite-ignore */ actionsDockPath)
    const {dock} = await setupDock()
    const actions = await mountInBody(ActionsDock)
    const focusButton = actions.find("button:has(use[href='#stopwatch'])")

    expect(dock.text()).not.toContain("Focus session")

    await focusButton.trigger("click")
    expect(dock.text()).toContain("Focus session")
    expect(dock.text()).toContain("Drag tasks here from the board")

    await focusButton.trigger("click")
    expect(dock.text()).not.toContain("Focus session")
    expect(bridge["focus:dispatch"]).not.toHaveBeenCalled()
  })

  it("adds a card released over the dock at the gap under the pointer, and the board moves nothing", async () => {
    const {dock, rows} = await setupDrop(makeColumn("active", ["A", "S1", "S2"]), ["S1", "S2"])

    board.startDrag(board.find("A"), yForIndex(0))
    await nextTick()
    board.hover(rows[1].element, 540)
    await nextTick()

    expect(rows[1].find("[data-drop-line]").exists()).toBe(true)
    expect(dock.findAll("[data-drop-line]")).toHaveLength(1)
    expect(board.drag.isOverDropZone).toBe(true)

    board.release(540)
    await nextTick()

    expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "add", taskId: "A", index: 1})
    expect(board.drag.isReleasedInsideDropZone).toBe(true)
    expect(board.tasks.moveTaskByOrder).not.toHaveBeenCalled()
  })

  it("offers no gap and adds nothing for a card already in the session or a done one", async () => {
    const {dock, rows} = await setupDrop(makeColumn("active", ["S1", "S2"]).concat(makeTask("D", {status: "done"})), ["S1", "S2"])

    for (const id of ["S1", "D"]) {
      board.startDrag(board.find(id), yForIndex(0))
      await nextTick()
      board.hover(rows[1].element, 540)
      await nextTick()

      expect(dock.find("[data-drop-line]").exists()).toBe(false)

      board.release(540)
      await nextTick()
    }

    expect(bridge["focus:dispatch"]).not.toHaveBeenCalled()
  })

  it("lets a card dragged over the dock and back onto a column move there as usual", async () => {
    const {rows} = await setupDrop(makeColumn("active", ["A", "S1"]), ["S1"])

    board.startDrag(board.find("A"), yForIndex(0))
    await nextTick()
    board.hover(rows[0].element, 510)
    board.moveOver("done", yForIndex(0))
    board.release(yForIndex(0))

    await vi.waitFor(() => expect(board.tasks.moveTaskByOrder).toHaveBeenCalledWith(expect.objectContaining({taskId: "A", targetStatus: "done"})))
    expect(bridge["focus:dispatch"]).not.toHaveBeenCalled()
  })

  async function setupOpenDock(sessionTaskIds, overrides = {}) {
    const {dock, focus} = await setupDock()
    focus.session = {...focus.session, tasks: sessionTaskIds.map(makeSessionTask), ...overrides}
    const {useUIStore} = await import("../../../../src/renderer/src/stores/ui/ui.store")
    useUIStore().toggleFocusDock(true)
    await nextTick()
    return {dock, focus}
  }

  function buttonNamed(dock, label) {
    return dock.findAll("button").find((button) => button.text() === label)
  }

  it("keeps Start disabled on an empty list and starts the session once it has a task", async () => {
    const {dock, focus} = await setupOpenDock([])

    expect(buttonNamed(dock, "Start").attributes("disabled")).toBeDefined()

    focus.session = {...focus.session, tasks: [makeSessionTask("S1")]}
    await nextTick()
    await buttonNamed(dock, "Start").trigger("click")

    expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "start"})
  })

  it("sends the mode picked and marks the one the session runs in", async () => {
    const {dock, focus} = await setupOpenDock(["S1"])

    await buttonNamed(dock, "Timer").trigger("click")
    expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "set-mode", mode: "timer"})

    focus.session = {...focus.session, mode: "pomodoro-50"}
    await nextTick()
    expect(dock.findAll("button[aria-pressed='true']").map((button) => button.text())).toEqual(["50 / 10"])
  })

  it("is no drop zone and shows no list once the session has left collect", async () => {
    const {dock} = await setupOpenDock(["S1"], {phase: "focus", currentTaskId: "S1", runStartedAt: "2026-09-26T10:00:00.000Z"})

    expect(dock.text()).toContain("Focus session")
    expect(dock.find("[data-focus-drop-zone]").exists()).toBe(false)
    expect(dock.find("[data-focus-row]").exists()).toBe(false)
    expect(buttonNamed(dock, "Start")).toBeUndefined()
  })

  it("removes the task whose × is pressed", async () => {
    const {dock} = await setupOpenDock(["S1", "S2"])

    await dock.findAll("[data-focus-row]")[1].find("button").trigger("click")

    expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "remove", taskId: "S2"})
  })

  it("removes one task on a double-click on ×, whose second click lands on the × of the row that moved down into its place", async () => {
    const {dock} = await setupOpenDock(["S1", "S2", "S3"])

    await dock.findAll("[data-focus-row]")[1].find("button").trigger("click", {detail: 2})
    expect(bridge["focus:dispatch"]).not.toHaveBeenCalled()

    await dock.findAll("[data-focus-row]")[1].find("button").trigger("click", {detail: 1})
    expect(bridge["focus:dispatch"].mock.calls).toEqual([[{type: "remove", taskId: "S2"}]])
  })

  async function setupReorder(sessionTaskIds) {
    const {dock} = await setupOpenDock(sessionTaskIds)
    const rows = mockRowRects(dock)

    function press(row, y) {
      row.element.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 100, clientY: y, pointerId: 1}))
    }

    function move(y) {
      window.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 100, clientY: y, pointerId: 1}))
    }

    function release(y) {
      window.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 100, clientY: y, pointerId: 1}))
    }

    return {dock, rows, press, move, release}
  }

  it("moves a row dragged above the first to the top, and shows the line where it lands", async () => {
    const {dock, rows, press, move, release} = await setupReorder(["S1", "S2", "S3"])

    press(rows[2], 597)
    move(590)
    move(505)
    await nextTick()

    expect(rows[0].find("[data-drop-line]").exists()).toBe(true)

    release(505)
    await nextTick()

    expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "move", taskId: "S3", index: 0})
    expect(dock.find("[data-drop-line]").exists()).toBe(false)
  })

  it("moves a row dragged below the last to the end of the list with the row itself taken out", async () => {
    const {press, move, release, rows} = await setupReorder(["S1", "S2", "S3"])

    press(rows[0], 517)
    move(610)
    release(610)

    expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "move", taskId: "S1", index: 2})
  })

  it("sends nothing for a row released in its own place or dragged and then escaped", async () => {
    const {press, move, release, rows} = await setupReorder(["S1", "S2", "S3"])

    press(rows[1], 557)
    move(545)
    release(545)

    press(rows[2], 597)
    move(505)
    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    release(505)

    expect(bridge["focus:dispatch"]).not.toHaveBeenCalled()
  })

  it("dims a pressed row as a drag only once the pointer has travelled more than 2 px", async () => {
    const {press, move, rows} = await setupReorder(["S1", "S2", "S3"])

    press(rows[0], 517)
    move(519)
    await nextTick()
    expect(rows[0].classes()).not.toContain("opacity-50")

    move(520)
    await nextTick()
    expect(rows[0].classes()).toContain("opacity-50")
  })

  describe("running", () => {
    const T0 = new Date("2026-09-26T10:00:00.000Z")

    beforeEach(() => {
      vi.useFakeTimers({now: T0})
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    async function tick(seconds) {
      await vi.advanceTimersByTimeAsync(seconds * 1000)
      await nextTick()
    }

    function arcShare(dock) {
      return 1 - Number(dock.find("circle[stroke-dashoffset]").attributes("stroke-dashoffset"))
    }

    function buttonLabels(dock) {
      return dock.findAll("button").map((button) => button.text())
    }

    function filledDots(dock) {
      return dock.findAll("[data-focus-dot]").map((dot) => dot.classes().includes("bg-accent"))
    }

    async function setupRunning({runSecondsAgo = 0, ...overrides}) {
      const {dock, focus} = await setupOpenDock(["S1", "S2", "S3"])
      const runStartedAt = runSecondsAgo === null ? null : new Date(Date.now() - runSecondsAgo * 1000).toISOString()
      focus.session = {...focus.session, phase: "focus", currentTaskId: "S1", runStartedAt, ...overrides}
      await nextTick()
      return {dock, focus}
    }

    it("counts a pomodoro interval down from the time focused in it, rounding the time left up", async () => {
      const {dock} = await setupRunning({intervalFocusedSeconds: 60, runSecondsAgo: 30.6})

      expect(dock.text()).toContain("23:30")
      expect(arcShare(dock)).toBeCloseTo(90.6 / 1500, 6)

      await tick(10)
      expect(dock.text()).toContain("23:20")
    })

    it("stands still in pause and offers Resume and Stop only", async () => {
      const {dock} = await setupRunning({phase: "pause", intervalFocusedSeconds: 90, runSecondsAgo: null})

      expect(dock.text()).toContain("23:30")
      await tick(10)
      expect(dock.text()).toContain("23:30")
      expect(buttonLabels(dock)).toEqual(["Resume", "Stop"])

      await buttonNamed(dock, "Resume").trigger("click")
      expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "resume"})
    })

    it("places the current task in the list, lists the open tasks after it, and fills a dot per completed interval", async () => {
      const tasks = [{...makeSessionTask("S1"), isDone: true}, makeSessionTask("S2"), makeSessionTask("S3")]
      const {dock, focus} = await setupRunning({tasks, currentTaskId: "S2", completedIntervals: 2})

      expect(dock.text()).toContain("2 of 3")
      expect(dock.text()).toContain("Task S2")
      expect(dock.text()).toContain("Up next")
      expect(dock.text()).toContain("Task S3")
      expect(dock.text()).not.toContain("Task S1")
      expect(filledDots(dock)).toEqual([true, true, false, false])

      focus.session = {...focus.session, completedIntervals: 5}
      await nextTick()
      expect(filledDots(dock)).toEqual([true, true, true, true, true])
    })

    it("counts the current task's own focus time up in timer mode, rounding down, with a ring that fills over each minute and no dots", async () => {
      const tasks = [{...makeSessionTask("S1"), focusedSeconds: 125}, makeSessionTask("S2")]
      const {dock, focus} = await setupRunning({mode: "timer", tasks, runSecondsAgo: 10.6})

      expect(dock.text()).toContain("02:15")
      expect(arcShare(dock)).toBeCloseTo(15.6 / 60, 6)
      expect(dock.find("[data-focus-dot]").exists()).toBe(false)

      focus.session = {...focus.session, tasks: [{...makeSessionTask("S1"), focusedSeconds: 3600}], runStartedAt: null, phase: "pause"}
      await nextTick()
      expect(dock.text()).toContain("1:00:00")
    })

    it("counts a break down in green, names the task focus returns to, and ticks the tasks done so far", async () => {
      const tasks = [{...makeSessionTask("S1"), isDone: true}, makeSessionTask("S2"), makeSessionTask("S3")]
      const {dock} = await setupRunning({phase: "break", mode: "pomodoro-50", tasks, currentTaskId: "S2", runSecondsAgo: 60})

      expect(dock.text()).toContain("09:00")
      expect(dock.find("circle[stroke-dashoffset]").classes()).toContain("stroke-success")
      expect(dock.text()).toContain("Next: Task S2")
      expect(dock.findAll("li").map((row) => [row.text(), row.find("use[href='#check']").exists()])).toEqual([
        ["Task S1", true],
        ["Task S2", false],
        ["Task S3", false],
      ])

      await buttonNamed(dock, "Skip break").trigger("click")
      expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "skip-break"})
    })

    it("sums the session up in the summary, with each task's focus time, and closes it", async () => {
      const tasks = [
        {...makeSessionTask("S1"), focusedSeconds: 1440, isDone: true},
        {...makeSessionTask("S2"), focusedSeconds: 1560, isDone: true},
        makeSessionTask("S3"),
      ]
      const {dock, focus} = await setupRunning({phase: "summary", currentTaskId: null, runSecondsAgo: null, tasks, completedIntervals: 2})

      expect(dock.text()).toContain("2 of 3 done · 50 min focused · 2 pomodoros")
      expect(dock.findAll("li").map((row) => row.text())).toEqual(["Task S124 min.", "Task S226 min.", "Task S3—"])

      focus.session = {...focus.session, tasks: tasks.with(1, {...tasks[1], focusedSeconds: 1610}), completedIntervals: 1}
      await nextTick()
      expect(dock.text()).toContain("2 of 3 done · 51 min focused · 1 pomodoro")
      expect(dock.text()).not.toContain("pomodoros")

      focus.session = {...focus.session, mode: "timer", tasks: tasks.with(1, {...tasks[1], focusedSeconds: 1570})}
      await nextTick()
      expect(dock.text()).toContain("2 of 3 done · 50 min focused")
      expect(dock.text()).not.toContain("pomodoro")

      await buttonNamed(dock, "Close").trigger("click")
      expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "close"})
    })

    it("sends Done, Pause and Stop from focus", async () => {
      const {dock, focus} = await setupRunning({})
      const running = focus.session

      for (const [label, type] of [
        ["Done", "done"],
        ["Pause", "pause"],
        ["Stop", "stop"],
      ]) {
        focus.session = running
        await nextTick()
        await buttonNamed(dock, label).trigger("click")
        expect(bridge["focus:dispatch"]).toHaveBeenLastCalledWith({type})
      }
    })

    it("sends a single click, and ignores the second click of a double-click, which lands on the button that took the first one's place", async () => {
      const {dock, focus} = await setupRunning({})
      const running = focus.session

      for (const [phase, label, type] of [
        ["focus", "Done", "done"],
        ["focus", "Pause", "pause"],
        ["focus", "Stop", "stop"],
        ["pause", "Resume", "resume"],
        ["pause", "Stop", "stop"],
        ["break", "Skip break", "skip-break"],
        ["summary", "Close", "close"],
      ]) {
        focus.session = {...running, phase}
        await nextTick()

        await buttonNamed(dock, label).trigger("click", {detail: 2})
        expect(bridge["focus:dispatch"]).not.toHaveBeenCalled()

        await buttonNamed(dock, label).trigger("click", {detail: 1})
        expect(bridge["focus:dispatch"].mock.calls).toEqual([[{type}]])
        bridge["focus:dispatch"].mockClear()
      }
    })
  })
})
