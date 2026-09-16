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

function makeBranch(overrides = {}) {
  return {
    id: "main",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    name: "Main",
    description: "",
    ...overrides,
  }
}

function makeMilestoneTask(milestoneId, status = "active", overrides = {}) {
  return {
    id: `${milestoneId}-${Math.random().toString(36).slice(2)}`,
    branchId: "main",
    milestoneId,
    status,
    content: "task",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
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
    const {default: CalendarDock} = await import("../../../../src/renderer/src/ui/modules/CalendarDock")
    const {default: TaskCalendar} = await import("../../../../src/renderer/src/ui/common/calendar/TaskCalendar/TaskCalendar.vue")
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
      TaskCalendar,
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
    const {TaskCalendar, mountDock, ui, tasks} = await setup()
    const today = DateTime.now().toISODate()
    tasks.activeDay = today

    const dock = mountDock()

    expect(ui.isCalendarDockExpanded).toBe(false)
    expect(dock.element.hasAttribute("data-day-drop-zone")).toBe(true)

    const buttons = dock.findAll("button")
    expect(buttons).toHaveLength(1)

    const label = buttons[0].text()
    expect(label.startsWith("Today, ")).toBe(true)
    expect(label).toContain(String(DateTime.now().day))
    expect(label).not.toContain(String(DateTime.now().year))

    await buttons[0].trigger("click")

    expect(ui.isCalendarDockExpanded).toBe(true)

    const calendar = dock.findComponent(TaskCalendar)
    expect(calendar.exists()).toBe(true)
    expect(calendar.props("selectedDate")).toBe(today)
  })

  it("expands_TC-7_into_two_tabs_on_a_click_and_keeps_showing_the_calendar_on_the_days_tab", async () => {
    const {TaskCalendar, mountDock, ui, tasks, milestones} = await setup()
    tasks.activeDay = DateTime.now().toISODate()

    milestones.milestones = [makeMilestone({id: "m1", name: "Launch", progress: {total: 2, resolved: 1}})]
    milestones.isMilestonesLoaded = true

    const dock = mountDock()
    expect(ui.isCalendarDockExpanded).toBe(false)

    const buttons = dock.findAll("button")
    expect(buttons).toHaveLength(1)

    await buttons[0].trigger("click")

    expect(ui.isCalendarDockExpanded).toBe(true)

    const tabs = dock.findAll("[data-tab]")
    expect(tabs.map((tab) => tab.attributes("data-tab")).sort()).toEqual(["days", "milestones"])

    const calendar = dock.findComponent(TaskCalendar)
    expect(calendar.exists()).toBe(true)
  })

  it("lists_TC-8_the_projects_open_milestones_first_and_the_closed_ones_below_a_separator", async () => {
    const {mountDock, ui, milestones, filter, tasks} = await setup()

    milestones.milestones = [
      makeMilestone({id: "m-open-1", name: "Alpha", orderIndex: 1024, targetDate: "2026-10-01"}),
      makeMilestone({id: "m-open-2", name: "Beta", orderIndex: 2048, targetDate: "2026-11-15"}),
      makeMilestone({id: "m-closed", name: "Gamma", orderIndex: 3072, targetDate: "2026-09-01"}),
    ]
    milestones.isMilestonesLoaded = true

    tasks.tasks = [
      makeMilestoneTask("m-open-1", "done"),
      makeMilestoneTask("m-open-1", "active"),
      makeMilestoneTask("m-open-1", "active"),
      makeMilestoneTask("m-open-2", "active"),
      makeMilestoneTask("m-open-2", "active"),
      makeMilestoneTask("m-closed", "done"),
      makeMilestoneTask("m-closed", "done"),
      makeMilestoneTask("m-closed", "discarded"),
      makeMilestoneTask("m-closed", "discarded"),
    ]
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

  it("keeps_TC-9_the_panel_open_on_a_milestone_click_and_shows_its_diamond_and_name_on_the_pill", async () => {
    const {mountDock, ui, tasks, milestones, filter, MilestoneDiamond} = await setup()
    tasks.activeDay = DateTime.now().toISODate()

    milestones.milestones = [makeMilestone({id: "m1", name: "Launch", progress: {total: 2, resolved: 1}})]
    milestones.isMilestonesLoaded = true
    filter.setFrame("milestone")
    ui.setCalendarDockTab("milestones")
    ui.toggleCalendarDock(true)

    const dock = mountDock()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(ui.isCalendarDockExpanded).toBe(true)

    await dock.get('[data-drop-milestone="m1"]').trigger("click")

    expect(ui.isCalendarDockExpanded).toBe(true)
    expect(filter.activeMilestoneId).toBe("m1")

    ui.toggleCalendarDock(false)
    await nextTick()

    expect(dock.findAll("button")).toHaveLength(1)
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
    expect(ui.isCalendarDockExpanded).toBe(true)

    ui.toggleCalendarDock(false)
    await nextTick()

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
    expect(ui.isCalendarDockExpanded).toBe(true)
  })

  it("collapses_TC-14_on_a_click_outside_and_on_escape", async () => {
    const {mountDock, ui} = await setup()
    ui.toggleCalendarDock(true)
    mountDock()

    document.body.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(ui.isCalendarDockExpanded).toBe(false)

    ui.toggleCalendarDock(true)
    await nextTick()

    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    expect(ui.isCalendarDockExpanded).toBe(false)
  })

  it("restores_TC-15_the_pre_drag_state_and_ignores_the_click_that_ends_the_drag", async () => {
    const {mountDock, ui, drag} = await setup()
    mountDock()

    expect(ui.isCalendarDockExpanded).toBe(false)

    drag.setDraggingTaskId("task-1")
    expect(ui.isCalendarDockExpanded).toBe(true)

    drag.setDraggingTaskId(null)
    expect(ui.isCalendarDockExpanded).toBe(false)

    document.body.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(ui.isCalendarDockExpanded).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 0))

    ui.toggleCalendarDock(true)
    await nextTick()

    drag.setDraggingTaskId("task-2")
    expect(ui.isCalendarDockExpanded).toBe(true)

    drag.setDraggingTaskId(null)
    expect(ui.isCalendarDockExpanded).toBe(true)

    document.body.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(ui.isCalendarDockExpanded).toBe(true)
  })

  it("stays_collapsed_on_a_drag_when_auto_open_is_off_and_expands_after_holding_the_card_on_the_pill", async () => {
    const {mountDock, ui, drag} = await setup()
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    await vi.waitFor(() => expect(useSettingsStore().isSettingsLoaded).toBe(true))
    ui.shouldOpenCalendarDockOnDrag = false

    const dock = mountDock()
    const pill = dock.get("[data-dock-pill]").element
    const originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = vi.fn(() => pill)

    drag.setDraggingTaskId("task-1")
    expect(ui.isCalendarDockExpanded).toBe(false)

    window.dispatchEvent(new MouseEvent("pointermove", {clientX: 1, clientY: 1}))
    expect(ui.isCalendarDockExpanded).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(ui.isCalendarDockExpanded).toBe(true)

    drag.setDraggingTaskId(null)
    expect(ui.isCalendarDockExpanded).toBe(false)

    document.elementFromPoint = originalElementFromPoint
  })

  it("collapses_a_dock_opened_by_holding_the_card_on_the_pill_once_the_card_is_held_outside_the_dock", async () => {
    const {mountDock, ui, drag} = await setup()
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    await vi.waitFor(() => expect(useSettingsStore().isSettingsLoaded).toBe(true))
    ui.shouldOpenCalendarDockOnDrag = false

    const dock = mountDock()
    let elementAtPointer = dock.get("[data-dock-pill]").element
    const originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = vi.fn(() => elementAtPointer)

    drag.setDraggingTaskId("task-1")
    window.dispatchEvent(new MouseEvent("pointermove", {clientX: 1, clientY: 1}))
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(ui.isCalendarDockExpanded).toBe(true)

    elementAtPointer = document.body
    window.dispatchEvent(new MouseEvent("pointermove", {clientX: 1, clientY: 1}))
    expect(ui.isCalendarDockExpanded).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(ui.isCalendarDockExpanded).toBe(false)

    document.elementFromPoint = originalElementFromPoint
  })

  it("keeps_a_dock_opened_before_the_drag_expanded_while_the_card_is_held_outside_it_with_auto_open_off", async () => {
    const {mountDock, ui, drag} = await setup()
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    await vi.waitFor(() => expect(useSettingsStore().isSettingsLoaded).toBe(true))
    ui.shouldOpenCalendarDockOnDrag = false
    ui.toggleCalendarDock(true)

    mountDock()
    const originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = vi.fn(() => document.body)

    drag.setDraggingTaskId("task-1")
    window.dispatchEvent(new MouseEvent("pointermove", {clientX: 1, clientY: 1}))
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(ui.isCalendarDockExpanded).toBe(true)

    document.elementFromPoint = originalElementFromPoint
  })

  it("keeps_TC-1_the_dock_over_the_board_while_the_editor_is_open_and_still_collapses_it_when_the_editor_reopens", async () => {
    const {mountDock, ui, drag, editor} = await setup()

    editor.openNew({branchId: "main"})
    expect(editor.isOpen).toBe(true)

    const dock = mountDock()

    expect(dock.find("[data-day-drop-zone]").exists()).toBe(true)
    expect(dock.find("[data-dock-pill]").exists()).toBe(true)

    drag.setDraggingTaskId("task-1")
    expect(ui.isCalendarDockExpanded).toBe(true)

    drag.setDraggingTaskId(null)
    expect(ui.isCalendarDockExpanded).toBe(false)

    editor.clear()
    ui.toggleCalendarDock(true)
    await nextTick()
    expect(ui.isCalendarDockExpanded).toBe(true)

    editor.openNew({branchId: "main"})
    await nextTick()

    expect(ui.isCalendarDockExpanded).toBe(false)
  })

  it("collapses_TC-2_the_calendar_on_the_first_escape_while_the_editor_is_open_and_closes_the_editor_only_on_the_second", async () => {
    const {mountDock, ui, editor} = await setup()
    const {useEditorShortcuts} = await import("../../../../src/renderer/src/ui/modules/RightPanel/composables/useEditorShortcuts")

    mountDock()

    const ShortcutsHost = defineComponent({
      setup() {
        useEditorShortcuts()
        return () => h("div")
      },
    })
    const shortcutsHost = mount(ShortcutsHost, {attachTo: document.body})

    try {
      editor.openNew({branchId: "main"})
      await nextTick()

      ui.toggleCalendarDock(true)
      await nextTick()
      expect(ui.isCalendarDockExpanded).toBe(true)

      function pressEscape() {
        document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}))
      }

      pressEscape()
      await nextTick()

      expect(ui.isCalendarDockExpanded).toBe(false)
      expect(editor.isOpen).toBe(true)

      pressEscape()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(editor.isOpen).toBe(false)
    } finally {
      shortcutsHost.unmount()
    }
  })

  it("shows_TC-3_the_project_and_new_panels_only_while_the_calendar_is_collapsed_and_lets_new_create_a_task", async () => {
    const {ui, drag} = await setup()
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const {useBranchesStore} = await import("../../../../src/renderer/src/stores/branches.store")
    const {default: CalendarDock} = await import("../../../../src/renderer/src/ui/modules/CalendarDock")
    const projectDockPath = "../../../../src/renderer/src/ui/modules/ProjectDock.vue"
    const newTaskDockPath = "../../../../src/renderer/src/ui/modules/NewTaskDock.vue"
    const {default: ProjectDock} = await import(/* @vite-ignore */ projectDockPath)
    const {default: NewTaskDock} = await import(/* @vite-ignore */ newTaskDockPath)

    await vi.waitFor(() => expect(useSettingsStore().isSettingsLoaded).toBe(true))
    ui.shouldOpenCalendarDockOnDrag = true

    const branches = useBranchesStore()
    branches.branches = [makeBranch({name: "Nebula"})]

    const dock = mount(CalendarDock, {attachTo: document.body, global: {directives: {tooltip: {}}}})
    const project = mount(ProjectDock, {attachTo: document.body, global: {directives: {tooltip: {}}}})
    const newTask = mount(NewTaskDock, {attachTo: document.body, global: {directives: {tooltip: {}}}})

    try {
      function expectBothVisible() {
        expect(project.find("button").exists()).toBe(true)
        expect(project.text()).toContain("Nebula")
        expect(newTask.find("button").exists()).toBe(true)
        expect(newTask.text()).toContain("New")
      }

      function expectBothAbsent() {
        expect(project.find("button").exists()).toBe(false)
        expect(newTask.find("button").exists()).toBe(false)
      }

      expect(ui.isCalendarDockExpanded).toBe(false)
      expectBothVisible()

      ui.toggleCalendarDock(true)
      await nextTick()
      expectBothAbsent()

      ui.toggleCalendarDock(false)
      await nextTick()
      expectBothVisible()

      drag.setDraggingTaskId("task-1")
      await nextTick()
      expect(ui.isCalendarDockExpanded).toBe(true)
      expectBothAbsent()

      drag.setDraggingTaskId(null)
      await nextTick()
      expect(ui.isCalendarDockExpanded).toBe(false)
      expectBothVisible()

      await newTask.get("button").trigger("click")
      expect(newTask.emitted("createTask")).toHaveLength(1)
    } finally {
      dock.unmount()
      project.unmount()
      newTask.unmount()
    }
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

    tasks.tasks = [makeTask()]
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
