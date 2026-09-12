// @vitest-environment happy-dom
// @ts-nocheck
import {defineComponent, h, nextTick} from "vue"
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

describe("CalendarDock", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function setup() {
    const {default: CalendarDock} = await import("../../../../src/renderer/src/ui/modules/CalendarDock/CalendarDock.vue")
    const {default: BaseCalendar} = await import("../../../../src/renderer/src/ui/base/BaseCalendar/BaseCalendar.vue")
    const {useUIStore} = await import("../../../../src/renderer/src/stores/ui/ui.store")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks/tasks.store")
    const {useDragDropStore} = await import("../../../../src/renderer/src/stores/dragDrop.store")
    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")

    function mountDock() {
      wrapper = mount(CalendarDock, {attachTo: document.body, global: {directives: {tooltip: {}}}})
      return wrapper
    }

    return {
      BaseCalendar,
      mountDock,
      ui: useUIStore(),
      tasks: useTasksStore(),
      drag: useDragDropStore(),
      editor: useTaskEditorStore(),
    }
  }

  it("renders_TC-12_a_single_dated_button_in_a_drop_zone_root_and_expands_to_today_on_click", async () => {
    const {BaseCalendar, mountDock, ui, tasks} = await setup()
    const today = DateTime.now().toISODate()
    tasks.activeDay = today

    const dock = mountDock()

    expect(ui.calendarDockExpanded).toBe(false)
    expect(dock.element.hasAttribute("data-day-drop-zone")).toBe(true)

    const buttons = dock.findAll("button")
    expect(buttons).toHaveLength(1)

    const label = buttons[0].text()
    expect(label.startsWith("Today, ")).toBe(true)
    expect(label).toContain(String(DateTime.now().day))
    expect(label).not.toContain(String(DateTime.now().year))

    await buttons[0].trigger("click")

    expect(ui.calendarDockExpanded).toBe(true)

    const calendar = dock.findComponent(BaseCalendar)
    expect(calendar.exists()).toBe(true)
    expect(calendar.props("selectedDate")).toBe(today)
  })

  it("picks_TC-13_a_day_from_the_calendar_and_stays_expanded", async () => {
    const {mountDock, ui, tasks} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    ui.toggleCalendarDock(true)

    const dock = mountDock()
    const fifteenth = DateTime.now().set({day: 15}).toISODate()

    await dock.get(`[data-drop-day="${fifteenth}"]`).trigger("click")

    expect(tasks.activeDay).toBe(fifteenth)
    expect(ui.calendarDockExpanded).toBe(true)
  })

  it("collapses_TC-14_on_a_click_outside_and_on_escape", async () => {
    const {mountDock, ui} = await setup()
    ui.toggleCalendarDock(true)
    mountDock()

    document.body.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(ui.calendarDockExpanded).toBe(false)

    ui.toggleCalendarDock(true)
    await nextTick()

    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    expect(ui.calendarDockExpanded).toBe(false)
  })

  it("restores_TC-15_the_pre_drag_state_and_ignores_the_click_that_ends_the_drag", async () => {
    const {mountDock, ui, drag} = await setup()
    mountDock()

    expect(ui.calendarDockExpanded).toBe(false)

    drag.setDraggingTaskId("task-1")
    expect(ui.calendarDockExpanded).toBe(true)

    drag.setDraggingTaskId(null)
    expect(ui.calendarDockExpanded).toBe(false)

    document.body.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(ui.calendarDockExpanded).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 0))

    ui.toggleCalendarDock(true)
    await nextTick()

    drag.setDraggingTaskId("task-2")
    expect(ui.calendarDockExpanded).toBe(true)

    drag.setDraggingTaskId(null)
    expect(ui.calendarDockExpanded).toBe(true)

    document.body.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(ui.calendarDockExpanded).toBe(true)
  })

  it("hides_TC-16_the_dock_while_the_editor_is_open_and_collapses_it_when_the_editor_opens", async () => {
    const {mountDock, ui, drag, editor} = await setup()

    editor.openNew({branchId: "main"})
    expect(editor.isOpen).toBe(true)

    const dock = mountDock()
    expect(dock.find("[data-day-drop-zone]").exists()).toBe(false)
    expect(dock.find("button").exists()).toBe(false)

    drag.setDraggingTaskId("task-1")
    await nextTick()

    expect(dock.find("[data-day-drop-zone]").exists()).toBe(false)
    expect(dock.find("button").exists()).toBe(false)

    drag.setDraggingTaskId(null)
    editor.clear()
    await nextTick()

    expect(dock.find("[data-day-drop-zone]").exists()).toBe(true)

    ui.toggleCalendarDock(true)
    await nextTick()

    editor.openNew({branchId: "main"})
    await nextTick()

    expect(ui.calendarDockExpanded).toBe(false)
  })
})

describe("CalendarDock — a release inside the dock and the board underneath", () => {
  let host = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    host?.unmount()
    host = null
  })

  function makeTask(overrides = {}) {
    return {
      id: "t1",
      branchId: "main",
      content: "card",
      tags: [],
      estimatedTime: 0,
      spentTime: 0,
      status: "backlog",
      scheduled: null,
      minimized: false,
      orderIndex: 1024,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      deletedAt: null,
      attachments: [],
      ...overrides,
    }
  }

  async function setupBoard() {
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks/tasks.store")
    const {useDragDropStore} = await import("../../../../src/renderer/src/stores/dragDrop.store")
    const {useTaskColumns} = await import("../../../../src/renderer/src/composables/tasks/useTaskColumns")

    const tasks = useTasksStore()
    const drag = useDragDropStore()

    tasks.backlogTasks = [makeTask()]
    tasks.moveTaskByOrder = vi.fn().mockResolvedValue(true)

    let columns = null
    host = mount(
      defineComponent({
        setup() {
          columns = useTaskColumns()
          return () => h("div")
        },
      }),
    )
    await nextTick()

    return {tasks, drag, columns}
  }

  async function stageAndEndAColumnMove(columns) {
    await columns.onColumnChange("backlog", {added: {newIndex: 0}})
    columns.onDragEnd()
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  it("ignores_TC-19_a_column_move_staged_by_a_drag_released_inside_the_dock", async () => {
    const {tasks, drag, columns} = await setupBoard()

    drag.setDraggingTaskId("t1")
    drag.setReleasedInsideDropZone(true)

    await stageAndEndAColumnMove(columns)

    expect(tasks.moveTaskByOrder).not.toHaveBeenCalled()
  })

  it("commits_TC-19_a_column_move_when_the_drag_was_released_on_the_board", async () => {
    const {tasks, drag, columns} = await setupBoard()

    drag.setDraggingTaskId("t1")

    await stageAndEndAColumnMove(columns)

    expect(tasks.moveTaskByOrder).toHaveBeenCalledTimes(1)
  })
})
