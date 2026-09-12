// @vitest-environment happy-dom
// @ts-nocheck
import {defineComponent, h, nextTick} from "vue"
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {toDateLabel} from "@daily/std"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

function makeMilestone(overrides = {}) {
  return {
    id: "milestone-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    branchId: "main",
    name: "Launch",
    description: "",
    targetDate: null,
    orderIndex: 1024,
    progress: {total: 0, resolved: 0},
    ...overrides,
  }
}

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
    const {default: MilestoneDiamond} = await import("../../../../src/renderer/src/ui/common/milestones/MilestoneDiamond.vue")
    const {useUIStore} = await import("../../../../src/renderer/src/stores/ui/ui.store")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks/tasks.store")
    const {useDragDropStore} = await import("../../../../src/renderer/src/stores/dragDrop.store")
    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    const {useMilestonesStore} = await import("../../../../src/renderer/src/stores/milestones.store")
    const {useFilterStore} = await import("../../../../src/renderer/src/stores/filter.store")

    function mountDock() {
      wrapper = mount(CalendarDock, {attachTo: document.body, global: {directives: {tooltip: {}}}})
      return wrapper
    }

    return {
      BaseCalendar,
      MilestoneDiamond,
      mountDock,
      ui: useUIStore(),
      tasks: useTasksStore(),
      drag: useDragDropStore(),
      editor: useTaskEditorStore(),
      milestones: useMilestonesStore(),
      filter: useFilterStore(),
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

  it("expands_TC-7_into_two_tabs_on_a_click_and_keeps_showing_the_calendar_on_the_days_tab", async () => {
    const {BaseCalendar, mountDock, ui, tasks, milestones} = await setup()
    tasks.activeDay = DateTime.now().toISODate()

    milestones.milestones = [makeMilestone({id: "m1", name: "Launch", progress: {total: 2, resolved: 1}})]
    milestones.isMilestonesLoaded = true

    const dock = mountDock()
    expect(ui.calendarDockExpanded).toBe(false)

    const buttons = dock.findAll("button")
    expect(buttons).toHaveLength(1)

    await buttons[0].trigger("click")

    expect(ui.calendarDockExpanded).toBe(true)

    const tabs = dock.findAll("[data-tab]")
    expect(tabs.map((tab) => tab.attributes("data-tab")).sort()).toEqual(["days", "milestones"])

    const calendar = dock.findComponent(BaseCalendar)
    expect(calendar.exists()).toBe(true)
  })

  it("lists_TC-8_the_projects_open_milestones_first_and_the_closed_ones_below_a_separator", async () => {
    const {mountDock, ui, milestones, filter} = await setup()

    milestones.milestones = [
      makeMilestone({id: "m-open-1", name: "Alpha", orderIndex: 1024, targetDate: "2026-10-01", progress: {total: 3, resolved: 1}}),
      makeMilestone({id: "m-open-2", name: "Beta", orderIndex: 2048, targetDate: "2026-11-15", progress: {total: 2, resolved: 0}}),
      makeMilestone({id: "m-closed", name: "Gamma", orderIndex: 3072, targetDate: "2026-09-01", progress: {total: 4, resolved: 4}}),
    ]
    milestones.isMilestonesLoaded = true
    ui.setCalendarDockTab("milestones")
    ui.toggleCalendarDock(true)

    const dock = mountDock()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const rows = dock.findAll("[data-drop-milestone]")
    expect(rows.map((row) => row.attributes("data-drop-milestone"))).toEqual(["m-open-1", "m-open-2", "m-closed"])

    expect(rows[0].text()).toContain("Alpha")
    expect(rows[0].text()).toContain(toDateLabel("2026-10-01", {short: true}))
    expect(rows[0].text()).toContain("3 tasks")
    expect(rows[0].text()).toContain("33%")

    expect(rows[1].text()).toContain("Beta")
    expect(rows[1].text()).toContain(toDateLabel("2026-11-15", {short: true}))
    expect(rows[1].text()).toContain("2 tasks")
    expect(rows[1].text()).toContain("0%")

    expect(dock.text()).toContain("Closed · 1")

    expect(rows[2].text()).toContain("Gamma")
    expect(rows[2].text()).toContain("4 tasks")
    expect(rows[2].text()).toContain("100%")

    await rows[2].trigger("click")
    expect(filter.activeMilestoneId).toBe("m-closed")
  })

  it("closes_TC-9_the_panel_and_shows_the_clicked_milestones_diamond_and_name_on_the_pill", async () => {
    const {mountDock, ui, tasks, milestones, filter, MilestoneDiamond} = await setup()
    tasks.activeDay = DateTime.now().toISODate()

    milestones.milestones = [makeMilestone({id: "m1", name: "Launch", progress: {total: 2, resolved: 1}})]
    milestones.isMilestonesLoaded = true
    filter.setFrame("milestone")
    ui.setCalendarDockTab("milestones")
    ui.toggleCalendarDock(true)

    const dock = mountDock()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(ui.calendarDockExpanded).toBe(true)

    await dock.get('[data-drop-milestone="m1"]').trigger("click")

    expect(ui.calendarDockExpanded).toBe(false)
    expect(filter.activeMilestoneId).toBe("m1")

    const diamond = dock.findComponent(MilestoneDiamond)
    expect(diamond.exists()).toBe(true)
    expect(dock.text()).toContain("Launch")
  })

  it("clears_TC-10_the_filter_and_shows_every_milestone_when_the_framed_row_is_clicked_again", async () => {
    const {mountDock, ui, tasks, milestones, filter} = await setup()
    tasks.activeDay = DateTime.now().toISODate()

    milestones.milestones = [makeMilestone({id: "m1", name: "Launch", progress: {total: 2, resolved: 1}})]
    milestones.isMilestonesLoaded = true
    filter.setActiveMilestone("m1")
    filter.setFrame("milestone")
    ui.setCalendarDockTab("milestones")
    ui.toggleCalendarDock(true)

    const dock = mountDock()
    await new Promise((resolve) => setTimeout(resolve, 0))

    await dock.get('[data-drop-milestone="m1"]').trigger("click")

    expect(filter.activeMilestoneId).toBeNull()
    expect(filter.frame).toBe("milestone")

    const buttons = dock.findAll("button")
    expect(buttons).toHaveLength(1)
    expect(buttons[0].text()).toContain("All milestones")
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
