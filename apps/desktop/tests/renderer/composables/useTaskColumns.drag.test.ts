// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {makeColumn, mountBoardDrag, TODAY, TRACK_TOP, yForIndex} from "../../helpers/boardDrag"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

function itemsOf(items) {
  return items.map((item) => (item.kind === "task" ? item.task.id : "placeholder"))
}

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe("useTaskColumns — the board's pointer drag", () => {
  let board = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    board?.unmount()
    board = null
    document.body.innerHTML = ""
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function setupBoard(seed, options) {
    board = await mountBoardDrag(seed, options)
    return board
  }

  function placeholdersIn(columns) {
    return Object.values(columns.columnItems.value)
      .flat()
      .filter((item) => item.kind === "placeholder")
  }

  describe("TC-6 a press becomes a drag", () => {
    it("starts a drag only once the pointer has moved more than 2 px", async () => {
      const {columns, drag, press, moveOver, find} = await setupBoard(makeColumn("active", ["A", "B", "C", "D"]))

      const y = yForIndex(1)
      press(find("B"), y)
      moveOver("active", y + 2)
      await nextTick()

      expect(drag.draggingTaskId).toBeNull()
      expect(columns.isDragging.value).toBe(false)

      moveOver("active", y + 3)
      await nextTick()

      expect(drag.draggingTaskId).toBe("B")
      expect(columns.isDragging.value).toBe(true)
      expect(itemsOf(columns.columnItems.value.active)).toEqual(["A", "placeholder", "C", "D"])
    })

    it.each([
      ["a button", (card) => card.appendChild(document.createElement("button"))],
      ["a link", (card) => card.appendChild(document.createElement("a"))],
      ["an input", (card) => card.appendChild(document.createElement("input"))],
      [
        "an area marked to be ignored",
        (card) => {
          const area = card.appendChild(document.createElement("div"))
          area.setAttribute("data-draggable-task-ignore", "")
          return area.appendChild(document.createElement("span"))
        },
      ],
    ])("never drags a card pressed on %s", async (_, pick) => {
      const {columns, drag, cardOf, pressOn, moveOver, find} = await setupBoard(makeColumn("active", ["A", "B"]))

      const y = yForIndex(1)
      pressOn(pick(cardOf(find("B"))), y)
      moveOver("active", y + 20)
      await nextTick()

      expect(drag.draggingTaskId).toBeNull()
      expect(columns.isDragging.value).toBe(false)
    })

    it("never drags a card pressed with any button but the main one", async () => {
      const {columns, drag, press, moveOver, find} = await setupBoard(makeColumn("active", ["A", "B"]))

      const y = yForIndex(1)
      press(find("B"), y, 2)
      moveOver("active", y + 20)
      await nextTick()

      expect(drag.draggingTaskId).toBeNull()
      expect(columns.isDragging.value).toBe(false)
    })

    it("never drags while a move is being written, and drags again once it is", async () => {
      const {columns, drag, tasks, press, startDrag, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B", "C", "D"]))
      let finishWrite = null
      tasks.moveTaskByOrder.mockReturnValueOnce(new Promise((resolve) => (finishWrite = resolve)))

      startDrag(find("A"), yForIndex(0))
      moveOver("active", yForIndex(2))
      release(yForIndex(2))
      await settle()
      expect(columns.isDragDisabled.value).toBe(true)

      press(find("C"), yForIndex(2))
      moveOver("active", yForIndex(2) + 20)
      await nextTick()
      expect(drag.draggingTaskId).toBeNull()

      release(yForIndex(2) + 20)
      finishWrite({})
      await settle()

      press(find("C"), yForIndex(2))
      moveOver("active", yForIndex(2) + 20)
      await nextTick()
      expect(drag.draggingTaskId).toBe("C")
    })
  })

  describe("TC-7 the gap follows the pointer on the grid", () => {
    it("opens the gap in the slot under the pointer, clamped to the column, and nowhere outside the columns", async () => {
      const {columns, startDrag, moveOver, find} = await setupBoard([
        ...makeColumn("backlog", ["X"], {scheduled: null}),
        ...makeColumn("active", ["A", "B", "C", "D", "E"]),
      ])

      startDrag(find("X"), yForIndex(0))

      function gapAt(y) {
        moveOver("active", y)
        return columns.columnItems.value.active.findIndex((item) => item.kind === "placeholder")
      }

      expect(gapAt(150)).toBe(0)
      expect(gapAt(305)).toBe(0)
      expect(gapAt(306)).toBe(1)
      expect(gapAt(1100)).toBe(4)
      expect(gapAt(1600)).toBe(5)
      expect(columns.columnItems.value.active).toHaveLength(6)
      expect(itemsOf(columns.columnItems.value.backlog)).toEqual([])

      moveOver(null, 400)
      expect(placeholdersIn(columns)).toHaveLength(0)

      expect(gapAt(407)).toBe(1)
    })

    it("moves the gap as the column scrolls under a pointer that stays still", async () => {
      const {columns, tracks, startDrag, moveOver, find} = await setupBoard([
        ...makeColumn("backlog", ["X"], {scheduled: null}),
        ...makeColumn("active", ["A", "B", "C", "D", "E"]),
      ])

      startDrag(find("X"), yForIndex(0))
      moveOver("active", 407)
      expect(columns.columnItems.value.active.findIndex((item) => item.kind === "placeholder")).toBe(1)

      tracks.active.getBoundingClientRect.mockReturnValue({
        top: TRACK_TOP - 412,
        bottom: TRACK_TOP + 288,
        left: 0,
        right: 370,
        width: 370,
        height: 700,
      })
      tracks.active.parentElement.dispatchEvent(new Event("scroll"))

      expect(columns.columnItems.value.active.findIndex((item) => item.kind === "placeholder")).toBe(3)
    })
  })

  describe("autoscroll near the edges", () => {
    function scrollable(element, rect, size) {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue({width: rect.right - rect.left, height: rect.bottom - rect.top, ...rect})
      for (const [key, value] of Object.entries(size)) Object.defineProperty(element, key, {value, configurable: true})
    }

    async function frames(count) {
      for (let index = 0; index < count; index++) await new Promise((resolve) => requestAnimationFrame(resolve))
    }

    it("scrolls a column by itself while the pointer is held near its bottom edge, and stops once the drag ends", async () => {
      const {tracks, startDrag, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B"]))
      const list = tracks.active.parentElement
      scrollable(list, {top: 0, bottom: 700, left: 0, right: 370}, {scrollHeight: 5000, clientHeight: 700})

      startDrag(find("A"), yForIndex(0))
      moveOver("active", 690)
      await frames(3)
      const scrolled = list.scrollTop
      expect(scrolled).toBeGreaterThan(0)

      release(690)
      await frames(3)
      expect(list.scrollTop).toBe(scrolled)
    })

    it("scrolls the board sideways only while a dragged card is held near its left or right edge", async () => {
      const {boardEl, startDrag, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B"]))
      scrollable(boardEl, {top: 450, bottom: 2000, left: 0, right: 1000}, {scrollWidth: 1600, clientWidth: 1000})
      const y = yForIndex(0) + 20

      function holdAt(x) {
        window.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: x, clientY: y, pointerId: 1}))
      }

      startDrag(find("A"), yForIndex(0))
      moveOver("active", y)
      holdAt(990)
      await frames(6)
      const scrolledRight = boardEl.scrollLeft
      expect(scrolledRight).toBeGreaterThan(0)

      holdAt(500)
      await frames(3)
      expect(boardEl.scrollLeft).toBe(scrolledRight)

      holdAt(10)
      await frames(2)
      const scrolledLeft = boardEl.scrollLeft
      expect(scrolledLeft).toBeLessThan(scrolledRight)
      expect(scrolledLeft).toBeGreaterThan(0)

      moveOver(null, y)
      await frames(3)
      expect(boardEl.scrollLeft).toBe(scrolledLeft)

      moveOver("active", y)
      holdAt(990)
      await frames(3)
      const scrolledAgain = boardEl.scrollLeft
      expect(scrolledAgain).toBeGreaterThan(scrolledLeft)

      release(y)
      await frames(3)
      expect(boardEl.scrollLeft).toBe(scrolledAgain)
    })
  })

  describe("TC-8 a reorder in the day frame", () => {
    it.each([
      [2, {targetTaskId: "D", position: "before"}],
      [3, {targetTaskId: null, position: "after"}],
    ])("writes a drop at index %i at once, against the card that follows it", async (index, target) => {
      const {tasks, startDrag, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B", "C", "D"]))
      vi.useFakeTimers()

      startDrag(find("B"), yForIndex(1))
      moveOver("active", yForIndex(index))
      release(yForIndex(index))

      expect(tasks.moveTaskByOrder).toHaveBeenCalledTimes(1)
      expect(tasks.moveTaskByOrder).toHaveBeenCalledWith({taskId: "B", targetStatus: "active", ...target, activeDate: TODAY})
    })

    it("writes nothing for a card dropped back at its own place", async () => {
      const {tasks, columns, startDrag, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B", "C", "D"]))
      vi.useFakeTimers()

      startDrag(find("B"), yForIndex(1))
      moveOver("active", yForIndex(2))
      moveOver("active", yForIndex(1))
      release(yForIndex(1))
      await vi.advanceTimersByTimeAsync(500)

      expect(tasks.moveTaskByOrder).not.toHaveBeenCalled()
      expect(itemsOf(columns.columnItems.value.active)).toEqual(["A", "B", "C", "D"])
    })
    it("writes nothing for a card let go where it was pressed, low on the card", async () => {
      const {tasks, columns, press, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B", "C", "D"]))
      vi.useFakeTimers()

      const lowOnB = TRACK_TOP + 206 + 180
      press(find("B"), lowOnB)
      moveOver("active", lowOnB + 4)
      expect(itemsOf(columns.columnItems.value.active)).toEqual(["A", "placeholder", "C", "D"])

      release(lowOnB)
      await vi.advanceTimersByTimeAsync(500)

      expect(tasks.moveTaskByOrder).not.toHaveBeenCalled()
    })

    it("writes nothing for the last card dropped below the end of its own column", async () => {
      const {tasks, startDrag, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B", "C", "D"]))
      vi.useFakeTimers()

      startDrag(find("D"), yForIndex(3))
      moveOver("active", yForIndex(8))
      release(yForIndex(8))
      await vi.advanceTimersByTimeAsync(500)

      expect(tasks.moveTaskByOrder).not.toHaveBeenCalled()
    })
  })

  describe("TC-9 a reorder in the milestone frame", () => {
    it("writes nothing and shows the card at its sorted place again", async () => {
      const {tasks, columns, startDrag, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B", "C", "D"]), {frame: "milestone"})
      vi.useFakeTimers()

      startDrag(find("B"), yForIndex(1))
      moveOver("active", yForIndex(3))
      expect(itemsOf(columns.columnItems.value.active)).toEqual(["A", "C", "D", "placeholder"])

      release(yForIndex(3))
      await vi.advanceTimersByTimeAsync(500)

      expect(tasks.moveTaskByOrder).not.toHaveBeenCalled()
      expect(itemsOf(columns.columnItems.value.active)).toEqual(["A", "B", "C", "D"])
    })
  })

  describe("TC-10 a move to another column", () => {
    it.each([
      ["day", {targetTaskId: "Y", position: "before"}],
      ["milestone", {targetTaskId: null, position: "after"}],
    ])("lands the card at once and writes it 160 ms later, in the %s frame", async (frame, target) => {
      const {tasks, columns, startDrag, moveOver, release, find} = await setupBoard(
        [...makeColumn("active", ["A", "B"]), ...makeColumn("done", ["X", "Y"])],
        {frame},
      )
      vi.useFakeTimers()

      startDrag(find("A"), yForIndex(0))
      moveOver("done", yForIndex(1))
      release(yForIndex(1))

      expect(itemsOf(columns.columnItems.value.done)).toEqual(["X", "A", "Y"])
      expect(columns.columnItems.value.done[1].task.status).toBe("done")
      expect(itemsOf(columns.columnItems.value.active)).toEqual(["B"])

      await vi.advanceTimersByTimeAsync(159)
      expect(tasks.moveTaskByOrder).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(tasks.moveTaskByOrder).toHaveBeenCalledTimes(1)
      expect(tasks.moveTaskByOrder).toHaveBeenCalledWith({taskId: "A", targetStatus: "done", ...target, activeDate: TODAY})
    })

    it("puts the card back at its old place when the write fails", async () => {
      const {tasks, columns, startDrag, moveOver, release, find} = await setupBoard([
        ...makeColumn("active", ["A", "B"]),
        ...makeColumn("done", ["X", "Y"]),
      ])
      tasks.moveTaskByOrder.mockResolvedValue(null)
      vi.useFakeTimers()

      startDrag(find("A"), yForIndex(0))
      moveOver("done", yForIndex(1))
      release(yForIndex(1))
      await vi.advanceTimersByTimeAsync(160)
      await settle()

      expect(tasks.moveTaskByOrder).toHaveBeenCalledTimes(1)
      expect(itemsOf(columns.columnItems.value.active)).toEqual(["A", "B"])
      expect(itemsOf(columns.columnItems.value.done)).toEqual(["X", "Y"])
    })
  })

  describe("TC-11 a release inside the calendar dock", () => {
    it("writes no column move for a drag released inside a drop zone", async () => {
      const {tasks, drag, startDrag, moveOver, release, find} = await setupBoard([
        ...makeColumn("backlog", ["X"], {scheduled: null}),
        ...makeColumn("active", ["A"]),
      ])
      vi.useFakeTimers()

      startDrag(find("X"), yForIndex(0))
      moveOver("active", yForIndex(1))
      drag.setReleasedInsideDropZone(true)
      release(yForIndex(1))
      await vi.advanceTimersByTimeAsync(500)

      expect(tasks.moveTaskByOrder).not.toHaveBeenCalled()
    })

    it("writes the column move for a drag released over a column", async () => {
      const {tasks, startDrag, moveOver, release, find} = await setupBoard([
        ...makeColumn("backlog", ["X"], {scheduled: null}),
        ...makeColumn("active", ["A"]),
      ])
      vi.useFakeTimers()

      startDrag(find("X"), yForIndex(0))
      moveOver("active", yForIndex(1))
      release(yForIndex(1))
      await vi.advanceTimersByTimeAsync(500)

      expect(tasks.moveTaskByOrder).toHaveBeenCalledTimes(1)
    })
    it("ends a drag dropped on a day through the release, swallowing the click after it", async () => {
      const {tasks, drag, startDrag, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B"]))
      const clicked = vi.fn()
      const dayCell = document.body.appendChild(document.createElement("div"))
      dayCell.addEventListener("click", clicked)

      startDrag(find("A"), yForIndex(0))
      moveOver(null, 400)
      drag.setReleasedInsideDropZone(true)
      tasks.tasks = tasks.tasks.map((task) => (task.id === "A" ? {...task, scheduled: {...task.scheduled, date: "2099-01-01"}} : task))
      await nextTick()
      release(400)
      dayCell.dispatchEvent(new MouseEvent("click", {bubbles: true}))

      expect(clicked).not.toHaveBeenCalled()
      expect(drag.draggingTaskId).toBeNull()
      expect(tasks.moveTaskByOrder).not.toHaveBeenCalled()
    })
  })

  describe("TC-12 a drag that ends without a drop", () => {
    it.each([
      ["Esc is pressed", () => window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))],
      [
        "the pointer is released outside every column and drop zone",
        ({moveOver, release}) => {
          moveOver(null, 400)
          release(400)
        },
      ],
      ["the pointer is cancelled", () => window.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, pointerId: 1}))],
      [
        "the dragged task disappears from the store",
        ({tasks}) => {
          tasks.tasks = tasks.tasks.filter((task) => task.id !== "B")
        },
      ],
    ])("writes nothing and ends the drag when %s", async (_, end) => {
      const board = await setupBoard([...makeColumn("active", ["A", "B", "C"]), ...makeColumn("done", ["X"])])
      const {tasks, drag, columns, startDrag, moveOver, find} = board
      vi.useFakeTimers()

      startDrag(find("B"), yForIndex(1))
      moveOver("done", yForIndex(0))
      expect(placeholdersIn(columns)).toHaveLength(1)

      end(board)
      await vi.advanceTimersByTimeAsync(500)

      expect(tasks.moveTaskByOrder).not.toHaveBeenCalled()
      expect(drag.draggingTaskId).toBeNull()
      expect(columns.isDragging.value).toBe(false)
      expect(placeholdersIn(columns)).toHaveLength(0)

      window.dispatchEvent(new Event("scroll"))
      expect(placeholdersIn(columns)).toHaveLength(0)
    })
  })

  describe("TC-13 the click after a drag", () => {
    it("swallows the click that ends a drag and lets a later plain click open the editor", async () => {
      const {cardOf, pressOn, moveOver, release, find} = await setupBoard(makeColumn("active", ["A", "B"]))
      const {default: TaskCard} = await import("../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
      const {useTaskEditorStore} = await import("../../../src/renderer/src/stores/task-editor")
      const editor = useTaskEditorStore()

      const card = cardOf(find("A"))
      const taskCard = mount(TaskCard, {props: {task: find("A")}, attachTo: card, global: {directives: {tooltip: {}}}})
      const root = card.querySelector("#A")

      async function click() {
        root.dispatchEvent(new MouseEvent("click", {bubbles: true}))
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      pressOn(root, yForIndex(0))
      moveOver("active", yForIndex(0) + 20)
      release(yForIndex(0) + 20)
      await click()
      expect(editor.editingTaskId).toBeNull()

      pressOn(root, yForIndex(0))
      moveOver("active", yForIndex(0) + 20)
      release(yForIndex(0) + 20)
      await new Promise((resolve) => setTimeout(resolve, 0))

      pressOn(root, yForIndex(0))
      release(yForIndex(0))
      await click()
      expect(editor.editingTaskId).toBe("A")

      taskCard.unmount()
    })
  })

  describe("TC-14 a column collapsing mid-drag", () => {
    it("keeps the drag alive and writes the move where the card is dropped", async () => {
      const {tasks, drag, columns, ui, startDrag, moveOver, release, find} = await setupBoard([
        ...makeColumn("active", ["A", "B"]),
        ...makeColumn("done", ["X"]),
        ...makeColumn("backlog", ["Z"], {scheduled: null}),
      ])
      vi.useFakeTimers()

      startDrag(find("A"), yForIndex(0))
      moveOver("active", yForIndex(1))
      ui.setSectionCollapsed("done", true)
      await nextTick()

      expect(drag.draggingTaskId).toBe("A")
      expect(columns.isDragging.value).toBe(true)

      moveOver("backlog", yForIndex(1))
      release(yForIndex(1))
      await vi.advanceTimersByTimeAsync(500)

      expect(tasks.moveTaskByOrder).toHaveBeenCalledTimes(1)
      expect(tasks.moveTaskByOrder.mock.calls[0][0]).toMatchObject({taskId: "A", targetStatus: "backlog"})
    })
  })
})
