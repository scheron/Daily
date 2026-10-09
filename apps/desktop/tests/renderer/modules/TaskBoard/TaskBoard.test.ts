// @vitest-environment happy-dom
// @ts-nocheck
import {effectScope, nextTick} from "vue"
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {installFakeResizeObserver, stubLayout} from "../../../helpers/resizeObserver"

const {deliverResize} = installFakeResizeObserver()

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    branchId: "main",
    milestoneId: null,
    status: "active",
    content: "task",
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: DateTime.now().toISODate(), time: "09:00", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    tags: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeMilestone(overrides = {}) {
  return {
    id: "milestone-1",
    branchId: "main",
    name: "Launch",
    description: "",
    targetDate: null,
    orderIndex: 1024,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeTag(overrides = {}) {
  return {
    id: "tag-1",
    branchId: "main",
    name: "Tag",
    color: "#888888",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeTasks(count, overrides = {}) {
  return Array.from({length: count}, (_, index) => makeTask({id: `task-${index}`, orderIndex: (index + 1) * 1024, ...overrides}))
}

function range(start, end) {
  return Array.from({length: end - start}, (_, offset) => start + offset)
}

async function settle() {
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await nextTick()
}

describe("TaskBoard", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
  })

  async function setup({sectionsCollapsed = {}, taskView = "regular", fontSize = "normal"} = {}) {
    const {default: TaskBoard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard")
    const {default: NoTasksPlaceholder} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/NoTasksPlaceholder.vue")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks/tasks.store")
    const {useDragDropStore} = await import("../../../../src/renderer/src/stores/dragDrop.store")
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const {useUIStore} = await import("../../../../src/renderer/src/stores/ui/ui.store")

    const settings = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve))
    settings.settings = {branch: {activeId: "main"}, layout: {sectionsCollapsed}, appearance: {taskView}, typography: {fontSize}}

    function mountBoard() {
      wrapper = mount(TaskBoard, {attachTo: document.body, global: {directives: {tooltip: {}}}})
      return wrapper
    }

    return {NoTasksPlaceholder, mountBoard, settings, tasks: useTasksStore(), drag: useDragDropStore(), ui: useUIStore()}
  }

  function columnOf(board, status) {
    return board.element.querySelector(`[data-column-status="${status}"]`)
  }

  function viewport(board, status, {clientHeight = 700, offsetTop = 100, scrollHeight = 0} = {}) {
    const list = columnOf(board, status).querySelector("[data-column-list]")
    const track = list?.querySelector("[data-column-track]")
    expect(track, `the ${status} column's list and track`).toBeTruthy()

    stubLayout(list, {clientHeight, scrollHeight})
    stubLayout(track, {offsetTop})
    deliverResize(list)
    return {list, track}
  }

  function cardsIn(board, status) {
    return Array.from(columnOf(board, status).querySelectorAll("[data-task-card]"))
  }

  function placedCards(board, status) {
    return cardsIn(board, status)
      .map((card) => ({index: Number(card.querySelector("[id^='task-']").id.slice(5)), transform: card.style.transform}))
      .sort((a, b) => a.index - b.index)
  }

  function onGrid(indices, step = 206) {
    return indices.map((index) => ({index, transform: `translateY(${index * step}px)`}))
  }

  it.each([
    ["small", 99.6],
    ["normal", 114],
    ["large", 128.4],
  ])("keeps compact virtual rows, track and gaps consistent at %s text size", async (fontSize, step) => {
    const {mountBoard, tasks} = await setup({taskView: "compact", fontSize})
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(221)
    const board = mountBoard()
    await nextTick()
    const {list, track} = viewport(board, "active", {clientHeight: 700, offsetTop: 100})
    await settle()
    expect(parseFloat(track.style.height)).toBeCloseTo(221 * step - 6)
    list.scrollTop = 100 + 100 * step
    list.dispatchEvent(new Event("scroll"))
    await settle()
    expect(placedCards(board, "active").map((card) => card.index)).toEqual(range(97, 100 + Math.ceil(700 / step) + 3))
    for (const card of cardsIn(board, "active")) {
      const index = Number(card.querySelector("[id^='task-']").id.slice(5))
      expect(parseFloat(card.style.transform.slice(11))).toBeCloseTo(index * step)
      expect(parseFloat(card.querySelector("[id^='task-']").style.height)).toBeCloseTo(step - 6)
    }
  })

  it.each([false, true])(
    "preserves the first visible task and its offset through density switches, including bottom clamping (selection outside board: %s)",
    async (outsideSelection) => {
      const {mountBoard, tasks, settings} = await setup()
      const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
      if (outsideSelection) useTaskEditorStore().editingTaskId = "task-outside-board"
      tasks.activeDay = DateTime.now().toISODate()
      tasks.tasks = makeTasks(221)
      const original = JSON.stringify(tasks.tasks)
      const board = mountBoard()
      await nextTick()
      const {list, track} = viewport(board, "active", {clientHeight: 700, offsetTop: 100})
      Object.defineProperty(list, "scrollHeight", {configurable: true, get: () => 100 + parseFloat(track.style.height) + 16})
      await settle()
      list.scrollTop = 100 + 100 * 206 + 37
      list.dispatchEvent(new Event("scroll"))
      await settle()
      settings.settings.appearance.taskView = "compact"
      await settle()
      expect(list.scrollTop).toBe(100 + 100 * 114 + 37)
      expect(placedCards(board, "active").some((card) => card.index === 100)).toBe(true)
      settings.settings.appearance.taskView = "regular"
      await settle()
      expect(list.scrollTop).toBe(100 + 100 * 206 + 37)
      list.scrollTop = list.scrollHeight - 700
      list.dispatchEvent(new Event("scroll"))
      await settle()
      settings.settings.appearance.taskView = "compact"
      await settle()
      expect(list.scrollTop).toBe(100 + 221 * 114 - 6 + 16 - 700)
      expect(placedCards(board, "active").at(-1).index).toBe(220)
      expect(JSON.stringify(tasks.tasks)).toBe(original)
    },
  )

  it("keeps the first visible task in view when its regular offset exceeds the compact card height", async () => {
    const {mountBoard, tasks, settings} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(221)
    const board = mountBoard()
    await nextTick()
    const {list, track} = viewport(board, "active", {clientHeight: 700, offsetTop: 100})
    Object.defineProperty(list, "scrollHeight", {configurable: true, get: () => 100 + parseFloat(track.style.height) + 16})
    await settle()
    list.scrollTop = 20820
    list.dispatchEvent(new Event("scroll"))
    await settle()
    settings.settings.appearance.taskView = "compact"
    await settle()
    expect(list.scrollTop).toBe(11607)
    const firstVisible = cardsIn(board, "active").find((card) => {
      const top = track.offsetTop + parseFloat(card.style.transform.slice(11))
      const height = parseFloat(card.querySelector("[id^='task-']").style.height)
      return top + height > list.scrollTop && top < list.scrollTop + list.clientHeight
    })
    expect(firstVisible.querySelector("[id^='task-']").id).toBe("task-100")
    expect(11500 + 108 - list.scrollTop).toBe(1)
    settings.settings.appearance.taskView = "regular"
    await settle()
    expect(list.scrollTop).toBe(20807)
  })

  it("keeps the same compact task visible when text size changes", async () => {
    const {mountBoard, tasks, settings} = await setup({taskView: "compact"})
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(221)
    const board = mountBoard()
    await nextTick()
    const {list, track} = viewport(board, "active", {clientHeight: 700, offsetTop: 100})
    Object.defineProperty(list, "scrollHeight", {configurable: true, get: () => 100 + parseFloat(track.style.height) + 16})
    list.scrollTop = 100 + 100 * 114 + 37
    list.dispatchEvent(new Event("scroll"))
    await settle()
    settings.settings.typography.fontSize = "large"
    await settle()
    expect(list.scrollTop).toBeCloseTo(100 + 100 * 128.4 + 37)
    expect(placedCards(board, "active").some((card) => card.index === 100)).toBe(true)
  })

  it("uses compact dimensions for a drag placeholder", async () => {
    const {mountBoard, tasks} = await setup({taskView: "compact"})
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(4)
    const board = mountBoard()
    await nextTick()
    const {track} = viewport(board, "active", {clientHeight: 700, offsetTop: 100})
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({top: 100})
    vi.spyOn(document, "elementFromPoint").mockReturnValue(track)
    await settle()
    board.element
      .querySelector("#task-1")
      .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 50, clientY: 264, pointerId: 1}))
    window.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 50, clientY: 274, pointerId: 1}))
    await settle()
    const gaps = Array.from(track.children).filter((item) => !item.hasAttribute("data-task-card"))
    expect(gaps).toHaveLength(1)
    expect(gaps[0].style.height).toBe("108px")
    expect(gaps[0].style.transform).toBe("translateY(114px)")
    expect(track.style.height).toBe("450px")
    window.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, pointerId: 1}))
  })

  it("reveals the selected card on a switch while preserving its unsaved editor draft", async () => {
    const {mountBoard, tasks, settings} = await setup({sectionsCollapsed: {done: true}})
    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    const editor = useTaskEditorStore()
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(221, {status: "done"})
    await editor.open("task-200")
    editor.patch({content: "Unsaved text"})
    const board = mountBoard()
    await nextTick()
    const {list, track} = viewport(board, "done", {clientHeight: 700, offsetTop: 100})
    Object.defineProperty(list, "scrollHeight", {configurable: true, get: () => 100 + parseFloat(track.style.height) + 16})
    columnOf(board, "done").scrollIntoView = vi.fn()
    await settle()
    settings.settings.appearance.taskView = "compact"
    await settle()
    expect(list.scrollTop).toBe(100 + 200 * 114 + 54 - 350)
    expect(document.getElementById("task-200")).not.toBeNull()
    expect(editor.editingTaskId).toBe("task-200")
    expect(editor.draft.content).toBe("Unsaved text")
    expect(editor.isDirty).toBe(true)
  })

  it("keeps the columns mounted while a drag is in flight, even when the dragged task was the last one on the board", async () => {
    const {NoTasksPlaceholder, mountBoard, tasks, drag} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = [makeTask()]

    const board = mountBoard()
    expect(board.findComponent(NoTasksPlaceholder).exists()).toBe(false)

    drag.setDraggingTaskId("task-1")
    await nextTick()

    tasks.tasks = [makeTask({scheduled: {date: "2099-01-01", time: "09:00", timezone: "UTC"}})]
    await nextTick()

    expect(board.findComponent(NoTasksPlaceholder).exists()).toBe(false)
  })

  it("mounts only the cards in a column's viewport and three on each side, each at its place on the grid", async () => {
    const {mountBoard, tasks} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(221)

    const board = mountBoard()
    await nextTick()
    const {list, track} = viewport(board, "active", {clientHeight: 700, offsetTop: 100})
    await settle()

    expect(placedCards(board, "active")).toEqual(onGrid(range(0, 6)))
    expect(track.style.height).toBe(`${221 * 206 - 6}px`)

    list.scrollTop = 20700
    list.dispatchEvent(new Event("scroll"))
    await settle()

    expect(placedCards(board, "active")).toEqual(onGrid(range(97, 107)))
  })

  it("mounts no card of a collapsed column but keeps its track's height, the proxy for its scroll, and mounts its window once expanded", async () => {
    const {mountBoard, tasks, ui} = await setup({sectionsCollapsed: {done: true}})
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(20, {status: "done"})

    const board = mountBoard()
    await nextTick()
    const {track} = viewport(board, "done", {clientHeight: 700, offsetTop: 100})
    await settle()

    expect(cardsIn(board, "done")).toHaveLength(0)
    expect(track.style.height).toBe(`${20 * 206 - 6}px`)

    ui.setSectionCollapsed("done", false)
    await settle()

    expect(placedCards(board, "done")).toEqual(onGrid(range(0, 6)))
  })

  it("switching to the milestone frame mounts only the cards in view, without rewriting the document's stylesheets", async () => {
    const {mountBoard, tasks} = await setup()
    const {useFilterStore} = await import("../../../../src/renderer/src/stores/filter.store")
    const {useMilestonesStore} = await import("../../../../src/renderer/src/stores/milestones.store")
    const today = DateTime.now().toISODate()
    tasks.activeDay = today
    tasks.tasks = Array.from({length: 10}, (_, index) =>
      makeTask({
        id: `task-${index}`,
        milestoneId: "milestone-1",
        scheduled: {date: index === 0 ? today : "2099-01-01", time: "09:00", timezone: "UTC"},
      }),
    )
    useMilestonesStore().milestones = [makeMilestone()]

    const board = mountBoard()
    await nextTick()
    for (const status of ["backlog", "active", "done", "discarded"]) viewport(board, status, {clientHeight: 400, offsetTop: 100})
    await settle()
    expect(board.findAll("[data-task-card]")).toHaveLength(1)

    const headMutations = []
    const headObserver = new MutationObserver((records) => headMutations.push(...records))
    headObserver.observe(document.head, {childList: true, characterData: true, subtree: true})
    useFilterStore().setFrame("milestone")
    await settle()
    headMutations.push(...headObserver.takeRecords())
    headObserver.disconnect()

    expect(board.findAll("[data-task-card]")).toHaveLength(5)
    expect(headMutations).toHaveLength(0)
  })

  it("lists the backlog's tags in the header beside the active day's", async () => {
    const {mountBoard, tasks} = await setup()
    const {default: TagsDock} = await import("../../../../src/renderer/src/ui/modules/TagsDock.vue")
    const {default: DynamicTagsPanel} = await import("../../../../src/renderer/src/ui/common/misc/DynamicTagsPanel.vue")
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = [
      makeTask({id: "task-day", tags: [makeTag({id: "tag-bug", name: "Bug"})]}),
      makeTask({id: "task-backlog", status: "backlog", scheduled: null, tags: [makeTag({id: "tag-ideas", name: "Ideas"})]}),
    ]

    const board = mountBoard()
    await nextTick()

    expect(
      board
        .findComponent(TagsDock)
        .findComponent(DynamicTagsPanel)
        .props("tags")
        .map((tag) => tag.name),
    ).toEqual(["Bug", "Ideas"])
  })

  it("replaces a dragged card with a gap at its index and slides the cards only while dragging", async () => {
    const {mountBoard, tasks} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(4)

    const board = mountBoard()
    await nextTick()
    const {track} = viewport(board, "active", {clientHeight: 700, offsetTop: 100})
    await settle()

    vi.spyOn(document, "elementFromPoint").mockReturnValue(track)
    board.element
      .querySelector("#task-1")
      .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 50, clientY: 256, pointerId: 1}))
    window.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 50, clientY: 266, pointerId: 1}))
    await settle()

    expect(placedCards(board, "active").map((card) => card.index)).toEqual([0, 2, 3])
    const gaps = Array.from(track.children).filter((item) => !item.hasAttribute("data-task-card"))
    expect(gaps).toHaveLength(1)
    expect(gaps[0].style.transform).toBe("translateY(206px)")
    for (const card of cardsIn(board, "active"))
      expect(Array.from(card.classList)).toEqual(expect.arrayContaining(["transition-transform", "duration-140"]))

    window.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 50, clientY: 266, pointerId: 1}))
    await settle()

    expect(cardsIn(board, "active")).toHaveLength(4)
    for (const card of cardsIn(board, "active")) expect(card.classList.contains("transition-transform")).toBe(false)
  })

  it("never lets a native drag start from inside a card, except a link's own, which never starts a card drag", async () => {
    const {mountBoard, tasks} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(1)

    const board = mountBoard()
    await nextTick()
    viewport(board, "active")
    await settle()

    const imageDrag = new Event("dragstart", {bubbles: true, cancelable: true})
    board.element.querySelector("#task-0 .markdown-view").dispatchEvent(imageDrag)
    const link = board.element.querySelector("#task-0 .markdown-view").appendChild(document.createElement("a"))
    const linkDrag = new Event("dragstart", {bubbles: true, cancelable: true})
    link.dispatchEvent(linkDrag)

    expect(imageDrag.defaultPrevented).toBe(true)
    expect(linkDrag.defaultPrevented).toBe(false)
  })

  it("reveals a card far down a collapsed column by unfolding the column, bringing it into view and centring the card", async () => {
    const {mountBoard, tasks} = await setup({sectionsCollapsed: {done: true}})
    const {useTaskColumns} = await import("../../../../src/renderer/src/composables/tasks/useTaskColumns")
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(50, {status: "done"})

    const board = mountBoard()
    await nextTick()
    const {list} = viewport(board, "done", {clientHeight: 700, offsetTop: 100, scrollHeight: 100 + 50 * 206 - 6 + 16})
    const column = columnOf(board, "done")
    column.scrollIntoView = vi.fn()
    list.scrollTo = vi.fn(({top}) =>
      setTimeout(() => {
        list.scrollTop = top
        list.dispatchEvent(new Event("scroll"))
        list.dispatchEvent(new Event("scrollend"))
      }),
    )
    await settle()
    expect(document.getElementById("task-40")).toBeNull()

    const scope = effectScope()
    const columns = scope.run(() => useTaskColumns())

    try {
      const isRevealed = await columns.revealTask("task-40")

      expect(columns.isColumnCollapsed("done")).toBe(false)
      expect(column.scrollIntoView).toHaveBeenCalledWith({behavior: "instant", block: "nearest", inline: "nearest"})
      expect(list.scrollTo).toHaveBeenCalledWith({top: 100 + 40 * 206 + 100 - 350, behavior: "smooth"})
      expect(isRevealed).toBe(true)
      expect(document.getElementById("task-40")).not.toBeNull()

      expect(await columns.revealTask("task-missing")).toBe(false)
      expect(list.scrollTo).toHaveBeenCalledTimes(1)
      expect(column.scrollIntoView).toHaveBeenCalledTimes(1)
    } finally {
      scope.stop()
    }
  })
})
