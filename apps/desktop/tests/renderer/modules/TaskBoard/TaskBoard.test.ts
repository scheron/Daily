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
    status: "in_progress",
    content: "task",
    minimized: false,
    priority: "none",
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
  let originalAnimate

  beforeEach(() => {
    originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate")
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => ({cancel: vi.fn(), onfinish: null})),
    })
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate)
    else delete Element.prototype.animate
  })

  async function setup({sectionsCollapsed = {}, columnOrder, taskView = "regular", fontSize = "normal", boardMode = "normal"} = {}) {
    const {default: TaskBoard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard")
    const {default: NoTasksPlaceholder} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/NoTasksPlaceholder.vue")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks/tasks.store")
    const {useDragDropStore} = await import("../../../../src/renderer/src/stores/dragDrop.store")
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const {useUIStore} = await import("../../../../src/renderer/src/stores/ui/ui.store")

    const settings = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve))
    settings.settings = {
      branch: {activeId: "main"},
      layout: {sectionsCollapsed, columnOrder},
      appearance: {taskView, boardMode},
      typography: {fontSize},
    }

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

  function measureColumns(board, widths = {}, boardWidth = 1600) {
    const element = board.element.querySelector("[data-task-board]")
    const widthOf = (column) =>
      column.querySelector("[data-column-drag-handle]").getAttribute("aria-expanded") === "false" ? 68 : (widths[column.dataset.columnStatus] ?? 370)
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({left: 0, right: boardWidth, top: 0, bottom: 800, width: boardWidth, height: 800})
    Object.defineProperty(element, "clientWidth", {configurable: true, value: boardWidth})
    Object.defineProperty(element, "scrollWidth", {
      configurable: true,
      get: () =>
        Math.max(
          boardWidth,
          [...element.querySelectorAll("[data-column-status]")].reduce((sum, column) => sum + widthOf(column), 0),
        ),
    })
    for (const column of element.querySelectorAll("[data-column-status]")) {
      vi.spyOn(column, "getBoundingClientRect").mockImplementation(() => {
        const columns = [...element.querySelectorAll("[data-column-status]")]
        const left = columns.slice(0, columns.indexOf(column)).reduce((sum, item) => sum + widthOf(item), 0) - element.scrollLeft
        const width = widthOf(column)
        return {left, right: left + width, top: 0, bottom: 800, width, height: 800}
      })
      const getHandleRect = function () {
        const rect = column.getBoundingClientRect()
        const collapsed = this.getAttribute("aria-expanded") === "false"
        const left = rect.left + (collapsed ? 12 : 0)
        const width = collapsed ? 44 : rect.width
        return {left, right: left + width, top: 56, bottom: collapsed ? 174 : 92, width, height: collapsed ? 118 : 36}
      }
      for (const button of column.querySelectorAll("button[aria-expanded]"))
        vi.spyOn(button, "getBoundingClientRect").mockImplementation(getHandleRect)
    }
    return element
  }

  function startColumnDrag(board, status, clientX) {
    columnOf(board, status)
      .querySelector("button[aria-expanded]")
      .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX, clientY: 70, pointerId: 9}))
  }

  function moveColumnPointer(type, clientX, pointerId = 9) {
    window.dispatchEvent(new PointerEvent(type, {bubbles: true, cancelable: true, clientX, clientY: 75, pointerId}))
  }

  function columnStatuses(board) {
    return board.findAll("[data-column-status]").map((column) => column.attributes("data-column-status"))
  }

  async function activateColumn(board, status = "backlog", start = 100, activation = start + 10) {
    startColumnDrag(board, status, start)
    moveColumnPointer("pointermove", activation)
    await settle()
  }

  it.each(["normal", "agents"])("keeps %s column presentation and identity while carrying its own summary card (layout proxy)", async (boardMode) => {
    const saved = {done: true, cancelled: false}
    const {mountBoard, tasks, settings} = await setup({boardMode, sectionsCollapsed: saved})
    tasks.tasks = [makeTask(), makeTask({id: "second"}), ...makeTasks(3, {status: "done"})]
    const board = mountBoard()
    await nextTick()
    measureColumns(board)
    const source = columnOf(board, "in_progress")
    const list = source.querySelector("[data-column-list]")
    const cards = cardsIn(board, "in_progress")
    const before = columnStatuses(board)
    const widths = board.findAll("[data-column-status]").map((column) => column.element.getBoundingClientRect().width)
    await activateColumn(board, "in_progress", boardMode === "normal" ? 450 : 820)
    expect(columnStatuses(board)).toEqual(before)
    expect(board.findAll('button[aria-expanded="false"]')).toHaveLength(1)
    expect(board.findAll("[data-column-status]").map((column) => column.element.getBoundingClientRect().width)).toEqual(widths)
    expect(columnOf(board, "in_progress")).toBe(source)
    expect(source.querySelector("[data-column-list]")).toBe(list)
    cardsIn(board, "in_progress").forEach((card, index) => expect(card).toBe(cards[index]))
    expect(list.classList.contains("invisible")).toBe(false)
    expect(list.style.width).toBe("")
    expect(settings.settings.layout.sectionsCollapsed).toEqual(saved)
    const preview = document.querySelector("[data-column-drag-preview]")
    expect(preview.textContent).toContain("In Progress")
    expect(preview.textContent).toContain("2")
    expect(preview.querySelector("svg use").getAttribute("href")).toBe("#fire")
    expect(preview.querySelectorAll("button, [data-task-card], [data-column-list], [data-column-status]")).toHaveLength(0)
    expect(preview.getAttribute("aria-hidden")).toBe("true")
    expect(preview.hasAttribute("inert")).toBe(true)
    expect(preview.style.translate).toBe(`${(boardMode === "normal" ? 460 : 830) - 26}px 53px`)
    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    await settle()
    cardsIn(board, "in_progress").forEach((card, index) => expect(card).toBe(cards[index]))
    expect(settings.settings.layout.sectionsCollapsed).toEqual(saved)
    await settings.flush()
    expect(window.BridgeIPC["settings:save"].mock.calls).toEqual([])
  })

  it.each(["queued", "settled"])(
    "clears logical reorder when all tasks disappear after a %s swap and restores original presentation (layout proxy)",
    async (timing) => {
      const {mountBoard, tasks, settings} = await setup({sectionsCollapsed: {done: true}})
      const original = [makeTask()]
      tasks.tasks = original
      const board = mountBoard()
      await nextTick()
      measureColumns(board)
      await activateColumn(board)
      moveColumnPointer("pointermove", 1000)
      if (timing === "settled") {
        await settle()
        expect(columnStatuses(board)).not.toEqual(["backlog", "in_progress", "done", "cancelled"])
      }
      tasks.tasks = []
      await settle()
      expect(board.findAll("[data-column-status]")).toHaveLength(0)
      expect(document.querySelector("[data-column-drag-preview]")).toBeNull()
      tasks.tasks = original
      await settle()
      moveColumnPointer("pointermove", 1200)
      moveColumnPointer("pointerup", 1200)
      await settle()
      expect(columnStatuses(board)).toEqual(["backlog", "in_progress", "done", "cancelled"])
      expect(board.findAll('button[aria-expanded="false"]')).toHaveLength(1)
      expect(document.querySelector("[data-column-drag-preview]")).toBeNull()
      expect(settings.settings.layout.columnOrder).toBeUndefined()
      expect(settings.settings.layout.sectionsCollapsed).toEqual({done: true})
      await settings.flush()
      expect(window.BridgeIPC["settings:save"].mock.calls).toEqual([])
    },
  )

  it("swaps existing-width neighbors live (layout proxy), holds and reverses without saving until a valid drop", async () => {
    const {mountBoard, tasks, settings} = await setup()
    tasks.tasks = [makeTask()]
    const original = JSON.parse(JSON.stringify(tasks.tasks))
    const board = mountBoard()
    await nextTick()
    measureColumns(board)
    await activateColumn(board)
    moveColumnPointer("pointermove", 400)
    await settle()
    expect(columnStatuses(board)).toEqual(["in_progress", "backlog", "done", "cancelled"])
    moveColumnPointer("pointermove", 750)
    await settle()
    expect(columnStatuses(board)).toEqual(["in_progress", "done", "backlog", "cancelled"])
    for (const x of [750, 750, 400, 750]) {
      moveColumnPointer("pointermove", x)
      await settle()
      expect(columnStatuses(board)).toEqual(
        x === 400 ? ["in_progress", "backlog", "done", "cancelled"] : ["in_progress", "done", "backlog", "cancelled"],
      )
    }
    expect(settings.settings.layout.columnOrder).toBeUndefined()
    await settings.flush()
    expect(window.BridgeIPC["settings:save"].mock.calls).toEqual([])
    moveColumnPointer("pointerup", 750)
    await settle()
    expect(columnStatuses(board)).toEqual(["in_progress", "done", "backlog", "cancelled"])
    expect(settings.settings.layout.columnOrder).toEqual(["ready_for_agent", "in_progress", "ready_to_merge", "done", "backlog", "cancelled"])
    expect(tasks.tasks).toEqual(original)
    await settings.flush()
    expect(window.BridgeIPC["settings:save"].mock.calls).toEqual([
      [{layout: {columnOrder: ["ready_for_agent", "in_progress", "ready_to_merge", "done", "backlog", "cancelled"]}}],
    ])
  })

  it.each(["Escape", "pointercancel", "outside", "return to origin"])(
    "restores existing-width swaps (layout proxy) and original horizontal scroll on %s without saving",
    async (ending) => {
      const columnOrder = ["backlog", "ready_for_agent", "in_progress", "ready_to_merge", "done", "cancelled"]
      const {mountBoard, tasks, settings} = await setup({columnOrder, sectionsCollapsed: {done: true}})
      tasks.tasks = [makeTask()]
      const board = mountBoard()
      await nextTick()
      const element = measureColumns(board)
      element.scrollLeft = 200
      await activateColumn(board)
      moveColumnPointer("pointermove", 1000)
      await settle()
      expect(columnStatuses(board)).toEqual(["in_progress", "done", "cancelled", "backlog"])
      if (ending === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
      else if (ending === "pointercancel") moveColumnPointer("pointercancel", 1000)
      else if (ending === "outside") moveColumnPointer("pointerup", 1700)
      else {
        moveColumnPointer("pointermove", 110)
        await settle()
        moveColumnPointer("pointerup", 110)
      }
      await settle()
      expect(columnStatuses(board)).toEqual(["backlog", "in_progress", "done", "cancelled"])
      expect(settings.settings.layout.columnOrder).toEqual(columnOrder)
      expect(settings.settings.layout.sectionsCollapsed).toEqual({done: true})
      expect(element.scrollLeft).toBe(200)
      expect(document.querySelector("[data-column-drag-preview]")).toBeNull()
      await settings.flush()
      expect(window.BridgeIPC["settings:save"].mock.calls).toEqual([])
    },
  )

  it.each(["regular", "compact"])("keeps far-right scroll and tiny movement stable in %s (layout proxy)", async (taskView) => {
    const {mountBoard, tasks, settings} = await setup({boardMode: "agents", taskView})
    tasks.tasks = [makeTask({status: "in_progress"}), makeTask({id: "cancel", status: "cancelled"})]
    const board = mountBoard()
    await nextTick()
    const element = measureColumns(board, {backlog: 259, ready_for_agent: 400, in_progress: 300}, 700)
    element.scrollLeft = 1400
    const before = columnStatuses(board)
    await activateColumn(board, "cancelled", 350, 360)
    expect(columnStatuses(board)).toEqual(before)
    expect(element.scrollLeft).toBe(1400)
    for (const x of [361, 360, 359]) {
      moveColumnPointer("pointermove", x)
      await settle()
      expect(columnStatuses(board)).toEqual(before)
      expect(document.querySelector("[data-column-drag-preview]").textContent).toContain("Cancelled")
    }
    moveColumnPointer("pointermove", 100)
    await settle()
    expect(columnStatuses(board)).toEqual(["backlog", "ready_for_agent", "in_progress", "ready_to_merge", "cancelled", "done"])
    moveColumnPointer("pointerup", 100)
    await settle()
    const rect = columnOf(board, "cancelled").getBoundingClientRect()
    expect(rect.right).toBeGreaterThan(0)
    expect(rect.left).toBeLessThan(700)
    expect(settings.settings.layout.sectionsCollapsed).toEqual({})
    await settings.flush()
  })

  it.each(["drop", "Escape", "pointercancel"])(
    "keeps source and peer list/card identities and current scroll through reverse moves and %s (layout proxy)",
    async (ending) => {
      const {mountBoard, tasks, settings} = await setup()
      tasks.tasks = [...makeTasks(30), ...makeTasks(30, {status: "done"}).map((task) => ({...task, id: `done-${task.id}`}))]
      const board = mountBoard()
      await nextTick()
      const element = measureColumns(board)
      const source = viewport(board, "in_progress").list
      const peer = viewport(board, "done").list
      source.scrollTop = 4000
      peer.scrollTop = 2200
      source.dispatchEvent(new Event("scroll"))
      peer.dispatchEvent(new Event("scroll"))
      await settle()
      const sourceCards = cardsIn(board, "in_progress")
      const peerCards = cardsIn(board, "done")
      const insertBefore = element.insertBefore.bind(element)
      vi.spyOn(element, "insertBefore").mockImplementation((node, anchor) => {
        const moved = node.parentNode === element
        const result = insertBefore(node, anchor)
        if (moved && node instanceof HTMLElement)
          for (const list of node.querySelectorAll("[data-column-list]")) {
            list.scrollTop = 0
            list.dispatchEvent(new Event("scroll"))
          }
        return result
      })
      await activateColumn(board, "in_progress", 450, 460)
      for (const x of [700, 1100, 700, 450, 1100]) {
        moveColumnPointer("pointermove", x)
        await settle()
        expect(columnStatuses(board)).toEqual(
          x === 450
            ? ["backlog", "in_progress", "done", "cancelled"]
            : x === 700
              ? ["backlog", "done", "in_progress", "cancelled"]
              : ["backlog", "done", "cancelled", "in_progress"],
        )
        expect(source.scrollTop).toBe(4000)
        expect(peer.scrollTop).toBe(2200)
        cardsIn(board, "in_progress").forEach((card, index) => expect(card).toBe(sourceCards[index]))
        cardsIn(board, "done").forEach((card, index) => expect(card).toBe(peerCards[index]))
      }
      peer.scrollTop = 2400
      peer.dispatchEvent(new Event("scroll"))
      await settle()
      const currentPeerCards = cardsIn(board, "done")
      if (ending === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
      else moveColumnPointer(ending === "drop" ? "pointerup" : "pointercancel", 1100)
      await settle()
      expect(columnOf(board, "in_progress").querySelector("[data-column-list]")).toBe(source)
      expect(columnOf(board, "done").querySelector("[data-column-list]")).toBe(peer)
      expect(source.scrollTop).toBe(4000)
      expect(peer.scrollTop).toBe(2400)
      cardsIn(board, "in_progress").forEach((card, index) => expect(card).toBe(sourceCards[index]))
      cardsIn(board, "done").forEach((card, index) => expect(card).toBe(currentPeerCards[index]))
      await settings.flush()
    },
  )

  it.each([
    ["Escape", false],
    ["pointerup", false],
    ["pointercancel", false],
    ["blur", false],
    ["unmount", false],
    ["Escape", true],
    ["pointerup", true],
  ])("cannot resurrect the ghost after immediate %s (preview rendered %s, layout proxy)", async (ending, rendered) => {
    const {mountBoard, tasks, settings} = await setup()
    tasks.tasks = [makeTask()]
    const board = mountBoard()
    await nextTick()
    measureColumns(board)
    startColumnDrag(board, "backlog", 100)
    moveColumnPointer("pointermove", 120)
    if (rendered) await nextTick()
    if (ending === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    else if (ending === "blur") window.dispatchEvent(new Event("blur"))
    else if (ending === "unmount") {
      board.unmount()
      wrapper = null
    } else moveColumnPointer(ending, 120)
    await settle()
    expect(document.querySelector("[data-column-drag-preview]")).toBeNull()
    if (ending !== "unmount") expect(board.findAll('button[aria-expanded="false"]')).toHaveLength(0)
    expect(settings.settings.layout.sectionsCollapsed).toEqual({})
    expect(settings.settings.layout.columnOrder).toBeUndefined()
    await settings.flush()
    expect(window.BridgeIPC["settings:save"].mock.calls).toEqual([])
  })

  it.each(["board mode", "frame", "project", "day", "density", "collapse", "window resize", "board resize", "external order"])(
    "cancels column reorder on %s (layout proxy)",
    async (reason) => {
      const {mountBoard, tasks, settings, ui} = await setup()
      const {useFilterStore} = await import("../../../../src/renderer/src/stores/filter.store")
      tasks.tasks = [makeTask()]
      const board = mountBoard()
      await nextTick()
      const element = measureColumns(board)
      await activateColumn(board)
      moveColumnPointer("pointermove", 320)
      await settle()
      if (reason === "board mode") settings.settings.appearance.boardMode = "agents"
      if (reason === "frame") useFilterStore().setFrame("milestone")
      if (reason === "project") settings.settings.branch.activeId = "other"
      if (reason === "day") tasks.activeDay = "2099-01-01"
      if (reason === "density") settings.settings.appearance.taskView = "compact"
      if (reason === "collapse") ui.setSectionCollapsed("done", true)
      if (reason === "window resize") window.dispatchEvent(new Event("resize"))
      if (reason === "board resize") {
        element.getBoundingClientRect.mockReturnValue({left: 0, right: 900, top: 0, bottom: 800, width: 900, height: 800})
        deliverResize(element)
      }
      if (reason === "external order")
        settings.settings.layout.columnOrder = ["cancelled", "done", "in_progress", "backlog", "ready_for_agent", "ready_to_merge"]
      await settle()
      expect(document.querySelector("[data-column-drag-preview]")).toBeNull()
      expect(board.findAll('button[aria-expanded="false"]')).toHaveLength(reason === "collapse" ? 1 : 0)
      moveColumnPointer("pointerup", 320)
      await settings.flush()
      expect(window.BridgeIPC["settings:save"].mock.calls.every(([update]) => !update.layout?.columnOrder)).toBe(true)
    },
  )

  it("uses stable slots and a reversal deadband without pointer feedback jitter (layout proxy)", async () => {
    const {mountBoard, tasks} = await setup()
    tasks.tasks = [makeTask()]
    const board = mountBoard()
    await nextTick()
    measureColumns(board)
    await activateColumn(board)
    moveColumnPointer("pointermove", 300)
    await settle()
    for (const x of [282, 288, 282, 288]) {
      moveColumnPointer("pointermove", x)
      await settle()
      expect(columnStatuses(board)).toEqual(["in_progress", "backlog", "done", "cancelled"])
    }
    moveColumnPointer("pointermove", 280)
    await settle()
    expect(columnStatuses(board)).toEqual(["backlog", "in_progress", "done", "cancelled"])
  })

  it("autoscrolls existing columns in a narrow viewport and commits only on drop (layout proxy)", async () => {
    const {mountBoard, tasks, settings} = await setup({boardMode: "agents"})
    tasks.tasks = [makeTask()]
    const board = mountBoard()
    await nextTick()
    const element = measureColumns(board, {}, 259)
    await activateColumn(board, "backlog", 100, 110)
    expect(columnStatuses(board)[0]).toBe("backlog")
    moveColumnPointer("pointermove", 254)
    for (let index = 0; index < 145; index++) {
      await settle()
      element.dispatchEvent(new Event("scroll"))
    }
    expect(element.scrollLeft).toBe(1961)
    expect(columnStatuses(board).at(-1)).toBe("backlog")
    expect(settings.settings.layout.columnOrder).toBeUndefined()
    moveColumnPointer("pointerup", 254)
    await settle()
    expect(settings.settings.layout.columnOrder).toEqual(["ready_for_agent", "in_progress", "ready_to_merge", "done", "cancelled", "backlog"])
    await settings.flush()
  })

  it.each([false, true])(
    "keeps grip above status icon and allows plain/keyboard toggle after a cancelled drag (saved collapse %s, layout proxy)",
    async (collapsed) => {
      const {mountBoard, tasks, settings} = await setup({sectionsCollapsed: {in_progress: collapsed}})
      tasks.tasks = [makeTask()]
      const board = mountBoard()
      await nextTick()
      measureColumns(board)
      if (collapsed) expect(columnOf(board, "in_progress").querySelector("button svg use").getAttribute("href")).toBe("#drag-vertical")
      startColumnDrag(board, "in_progress", 450)
      moveColumnPointer("pointermove", 452)
      moveColumnPointer("pointerup", 452)
      columnOf(board, "in_progress")
        .querySelector("button")
        .dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, detail: 1}))
      await settle()
      expect(settings.settings.layout.sectionsCollapsed.in_progress).toBe(!collapsed)
      await activateColumn(board, "in_progress", 450, 460)
      expect(columnOf(board, "in_progress").querySelector("button svg use").getAttribute("href")).toBe("#drag-vertical")
      window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
      await settle()
      const click = new MouseEvent("click", {bubbles: true, cancelable: true, detail: 1})
      columnOf(board, "in_progress").querySelector("button").dispatchEvent(click)
      expect(click.defaultPrevented).toBe(true)
      columnOf(board, "in_progress")
        .querySelector("button")
        .dispatchEvent(new MouseEvent("click", {bubbles: true, detail: 0}))
      await settle()
      expect(settings.settings.layout.sectionsCollapsed.in_progress).toBe(collapsed)
      expect(settings.settings.layout.columnOrder).toBeUndefined()
      await settings.flush()
    },
  )

  it.each([false, true])(
    "drags the selected SVG grip without panning and ignores other pointer completion (saved collapse %s, layout proxy)",
    async (collapsed) => {
      const {mountBoard, tasks, settings} = await setup({sectionsCollapsed: {in_progress: collapsed}})
      tasks.tasks = [makeTask(), makeTask({id: "second"}), ...makeTasks(3, {status: "done"})]
      const board = mountBoard()
      await nextTick()
      const element = measureColumns(board, {}, 1000)
      element.scrollLeft = 100
      const grip = columnOf(board, "in_progress").querySelector('use[href="#drag-vertical"]').closest("svg")
      grip.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 300, clientY: 70, pointerId: 9}))
      moveColumnPointer("pointermove", 310)
      await settle()
      expect(element.scrollLeft).toBe(100)
      moveColumnPointer("pointermove", 900)
      moveColumnPointer("pointercancel", 900, 3)
      moveColumnPointer("pointerup", 900, 3)
      await settle()
      expect(document.querySelector("[data-column-drag-preview]").textContent).toContain("In Progress2")
      expect(columnStatuses(board)).toEqual(["backlog", "done", "cancelled", "in_progress"])
      moveColumnPointer("pointerup", 900)
      await settle()
      expect(settings.settings.layout.columnOrder).toEqual(["backlog", "ready_for_agent", "ready_to_merge", "done", "cancelled", "in_progress"])
      expect(settings.settings.layout.sectionsCollapsed.in_progress).toBe(collapsed)
      await settings.flush()
    },
  )

  it("keeps background panning and a card drag separate from column ordering (layout proxy)", async () => {
    const {mountBoard, tasks, settings, drag} = await setup()
    tasks.tasks = [makeTask()]
    const board = mountBoard()
    await nextTick()
    const element = measureColumns(board)
    element.scrollLeft = 200
    element.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 100, clientY: 300, pointerId: 1}))
    window.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, clientX: 150, clientY: 300, pointerId: 1}))
    window.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 1}))
    expect(element.scrollLeft).toBe(150)
    viewport(board, "in_progress")
    await settle()
    const track = columnOf(board, "in_progress").querySelector("[data-column-track]")
    vi.spyOn(document, "elementFromPoint").mockReturnValue(track)
    board.element
      .querySelector("#task-1")
      .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 50, clientY: 256, pointerId: 1}))
    window.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 50, clientY: 266, pointerId: 1}))
    await settle()
    expect(drag.draggingTaskId).toBe("task-1")
    expect(document.querySelector("[data-column-drag-preview]")).toBeNull()
    expect(settings.settings.layout.columnOrder).toBeUndefined()
    window.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, pointerId: 1}))
  })

  it("renders the saved order across board modes, frames and projects while collapse stays with its status", async () => {
    const columnOrder = ["ready_to_merge", "done", "ready_for_agent", "cancelled", "in_progress", "backlog"]
    const {mountBoard, tasks, settings} = await setup({columnOrder, sectionsCollapsed: {done: true}})
    const {useFilterStore} = await import("../../../../src/renderer/src/stores/filter.store")
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = [makeTask(), makeTask({id: "done-task", status: "done"}), makeTask({id: "other-task", branchId: "project-a"})]
    const originalTasks = JSON.parse(JSON.stringify(tasks.tasks))
    const board = mountBoard()
    await nextTick()
    const renderedOrder = () => board.findAll("[data-column-status]").map((column) => column.attributes("data-column-status"))

    expect(renderedOrder()).toEqual(["done", "cancelled", "in_progress", "backlog"])
    expect(columnOf(board, "done").querySelector("button").getAttribute("aria-expanded")).toBe("false")
    settings.settings.appearance.boardMode = "agents"
    await nextTick()
    expect(renderedOrder()).toEqual(["ready_to_merge", "done", "ready_for_agent", "cancelled", "in_progress", "backlog"])
    useFilterStore().setFrame("milestone")
    settings.settings.branch.isAllProjects = true
    await nextTick()
    expect(renderedOrder()).toEqual(["ready_to_merge", "done", "ready_for_agent", "cancelled", "in_progress", "backlog"])
    settings.settings.branch.isAllProjects = false
    settings.settings.branch.activeId = "project-a"
    settings.settings.appearance.boardMode = "normal"
    await nextTick()
    expect(renderedOrder()).toEqual(["done", "cancelled", "in_progress", "backlog"])
    expect(settings.settings.layout.columnOrder).toEqual(columnOrder)
    expect(settings.settings.layout.sectionsCollapsed.done).toBe(true)
    expect(tasks.tasks).toEqual(originalTasks)
  })

  it("keeps every available column once when an incomplete raw order reaches the renderer", async () => {
    const {mountBoard, tasks} = await setup({boardMode: "agents", columnOrder: ["done", "unknown", "done", "backlog"]})
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = [makeTask()]
    const board = mountBoard()
    await nextTick()

    expect(board.findAll("[data-column-status]").map((column) => column.attributes("data-column-status"))).toEqual([
      "done",
      "backlog",
      "ready_for_agent",
      "in_progress",
      "ready_to_merge",
      "cancelled",
    ])
  })

  it.each([
    ["day", "regular", false],
    ["day", "compact", false],
    ["day", "regular", true],
    ["day", "compact", true],
    ["milestone", "regular", false],
    ["milestone", "compact", false],
  ])("switches columns in %s / %s / All projects=%s without rewriting statuses, dates or order", async (frame, taskView, allProjects) => {
    const {mountBoard, tasks, settings} = await setup({taskView})
    const {useFilterStore} = await import("../../../../src/renderer/src/stores/filter.store")
    useFilterStore().setFrame(frame)
    settings.settings.branch.isAllProjects = allProjects
    const day = DateTime.now().toISODate()
    tasks.activeDay = day
    tasks.tasks = [
      makeTask({id: "queue", content: "queue", status: "ready_for_agent", scheduled: null}),
      makeTask({id: "today", content: "today", status: "ready_for_agent"}),
      makeTask({id: "tomorrow", content: "tomorrow", status: "ready_for_agent", scheduled: {date: "2099-01-01", time: "09:00", timezone: "UTC"}}),
      makeTask({id: "review", content: "review", status: "ready_to_merge"}),
      makeTask({id: "other-project-ready", content: "Other project queue", branchId: "other", status: "ready_for_agent", scheduled: null}),
    ]
    const original = JSON.parse(JSON.stringify(tasks.tasks))
    const board = mountBoard()
    await nextTick()
    expect(board.findAll("[data-column-status]")).toHaveLength(4)
    expect(board.findAll("[data-column-status]").map((column) => column.attributes("data-column-status"))).toEqual([
      "backlog",
      "in_progress",
      "done",
      "cancelled",
    ])
    expect(columnOf(board, "backlog").textContent).toContain("queue")
    expect(columnOf(board, "backlog").textContent).toContain("today")
    expect(board.text().includes("Other project queue")).toBe(allProjects)
    if (frame === "milestone") expect(columnOf(board, "backlog").textContent).toContain("tomorrow")
    else expect(board.text()).not.toContain("tomorrow")
    settings.settings.appearance.boardMode = "agents"
    await nextTick()
    expect(board.findAll("[data-column-status]")).toHaveLength(6)
    expect(columnOf(board, "ready_for_agent").textContent).toContain("queue")
    expect(columnOf(board, "ready_to_merge").textContent).toContain("review")
    settings.settings.appearance.boardMode = "normal"
    await nextTick()
    expect(board.findAll("[data-column-status]")).toHaveLength(4)
    expect(tasks.tasks).toEqual(original)
  })

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
    const {list, track} = viewport(board, "in_progress", {clientHeight: 700, offsetTop: 100})
    await settle()
    expect(parseFloat(track.style.height)).toBeCloseTo(221 * step - 6)
    list.scrollTop = 100 + 100 * step
    list.dispatchEvent(new Event("scroll"))
    await settle()
    expect(placedCards(board, "in_progress").map((card) => card.index)).toEqual(range(97, 100 + Math.ceil(700 / step) + 3))
    for (const card of cardsIn(board, "in_progress")) {
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
      const {list, track} = viewport(board, "in_progress", {clientHeight: 700, offsetTop: 100})
      Object.defineProperty(list, "scrollHeight", {configurable: true, get: () => 100 + parseFloat(track.style.height) + 16})
      await settle()
      list.scrollTop = 100 + 100 * 206 + 37
      list.dispatchEvent(new Event("scroll"))
      await settle()
      settings.settings.appearance.taskView = "compact"
      await settle()
      expect(list.scrollTop).toBe(100 + 100 * 114 + 37)
      expect(placedCards(board, "in_progress").some((card) => card.index === 100)).toBe(true)
      settings.settings.appearance.taskView = "regular"
      await settle()
      expect(list.scrollTop).toBe(100 + 100 * 206 + 37)
      list.scrollTop = list.scrollHeight - 700
      list.dispatchEvent(new Event("scroll"))
      await settle()
      settings.settings.appearance.taskView = "compact"
      await settle()
      expect(list.scrollTop).toBe(100 + 221 * 114 - 6 + 16 - 700)
      expect(placedCards(board, "in_progress").at(-1).index).toBe(220)
      expect(JSON.stringify(tasks.tasks)).toBe(original)
    },
  )

  it("keeps the first visible task in view when its regular offset exceeds the compact card height", async () => {
    const {mountBoard, tasks, settings} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(221)
    const board = mountBoard()
    await nextTick()
    const {list, track} = viewport(board, "in_progress", {clientHeight: 700, offsetTop: 100})
    Object.defineProperty(list, "scrollHeight", {configurable: true, get: () => 100 + parseFloat(track.style.height) + 16})
    await settle()
    list.scrollTop = 20820
    list.dispatchEvent(new Event("scroll"))
    await settle()
    settings.settings.appearance.taskView = "compact"
    await settle()
    expect(list.scrollTop).toBe(11607)
    const firstVisible = cardsIn(board, "in_progress").find((card) => {
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
    const {list, track} = viewport(board, "in_progress", {clientHeight: 700, offsetTop: 100})
    Object.defineProperty(list, "scrollHeight", {configurable: true, get: () => 100 + parseFloat(track.style.height) + 16})
    list.scrollTop = 100 + 100 * 114 + 37
    list.dispatchEvent(new Event("scroll"))
    await settle()
    settings.settings.typography.fontSize = "large"
    await settle()
    expect(list.scrollTop).toBeCloseTo(100 + 100 * 128.4 + 37)
    expect(placedCards(board, "in_progress").some((card) => card.index === 100)).toBe(true)
  })

  it("uses compact dimensions for a drag placeholder", async () => {
    const {mountBoard, tasks} = await setup({taskView: "compact"})
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(4)
    const board = mountBoard()
    await nextTick()
    const {track} = viewport(board, "in_progress", {clientHeight: 700, offsetTop: 100})
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
    const {list, track} = viewport(board, "in_progress", {clientHeight: 700, offsetTop: 100})
    await settle()

    expect(placedCards(board, "in_progress")).toEqual(onGrid(range(0, 6)))
    expect(track.style.height).toBe(`${221 * 206 - 6}px`)

    list.scrollTop = 20700
    list.dispatchEvent(new Event("scroll"))
    await settle()

    expect(placedCards(board, "in_progress")).toEqual(onGrid(range(97, 107)))
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
    for (const status of ["backlog", "in_progress", "done", "cancelled"]) viewport(board, status, {clientHeight: 400, offsetTop: 100})
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
    const {track} = viewport(board, "in_progress", {clientHeight: 700, offsetTop: 100})
    await settle()

    vi.spyOn(document, "elementFromPoint").mockReturnValue(track)
    board.element
      .querySelector("#task-1")
      .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 50, clientY: 256, pointerId: 1}))
    window.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 50, clientY: 266, pointerId: 1}))
    await settle()

    expect(placedCards(board, "in_progress").map((card) => card.index)).toEqual([0, 2, 3])
    const gaps = Array.from(track.children).filter((item) => !item.hasAttribute("data-task-card"))
    expect(gaps).toHaveLength(1)
    expect(gaps[0].style.transform).toBe("translateY(206px)")
    for (const card of cardsIn(board, "in_progress"))
      expect(Array.from(card.classList)).toEqual(expect.arrayContaining(["transition-transform", "duration-140"]))

    window.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 50, clientY: 266, pointerId: 1}))
    await settle()

    expect(cardsIn(board, "in_progress")).toHaveLength(4)
    for (const card of cardsIn(board, "in_progress")) expect(card.classList.contains("transition-transform")).toBe(false)
  })

  it("never lets a native drag start from inside a card, except a link's own, which never starts a card drag", async () => {
    const {mountBoard, tasks} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = makeTasks(1)

    const board = mountBoard()
    await nextTick()
    viewport(board, "in_progress")
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
