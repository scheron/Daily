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

  async function setup({sectionsCollapsed = {}} = {}) {
    const {default: TaskBoard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard")
    const {default: NoTasksPlaceholder} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/NoTasksPlaceholder.vue")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks/tasks.store")
    const {useDragDropStore} = await import("../../../../src/renderer/src/stores/dragDrop.store")
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const {useUIStore} = await import("../../../../src/renderer/src/stores/ui/ui.store")

    const settings = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve))
    settings.settings = {branch: {activeId: "main"}, layout: {sectionsCollapsed}}

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

  function onGrid(indices) {
    return indices.map((index) => ({index, transform: `translateY(${index * 206}px)`}))
  }

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
