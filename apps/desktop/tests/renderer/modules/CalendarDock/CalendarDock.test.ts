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

    async function mountDock() {
      wrapper = mount(CalendarDock, {attachTo: document.body, global: {directives: {tooltip: {}}}})
      await nextTick()
      return wrapper
    }

    async function hover(dock, type) {
      dock.element.dispatchEvent(new MouseEvent(type))
      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    return {
      TaskCalendar,
      MilestoneDiamond,
      mountDock,
      hover,
      ui: useUIStore(),
      tasks: useTasksStore(),
      drag: useDragDropStore(),
      editor: useTaskEditorStore(),
      milestones: useMilestonesStore(),
      filter: useFilterStore(),
    }
  }

  it("renders_TC-12_a_single_dated_pill_in_a_drop_zone_root_and_expands_to_today_on_hover", async () => {
    const {TaskCalendar, mountDock, hover, ui, tasks} = await setup()
    const today = DateTime.now().toISODate()
    tasks.activeDay = today

    const dock = await mountDock()

    expect(ui.isCalendarDockExpanded).toBe(false)
    expect(dock.element.hasAttribute("data-day-drop-zone")).toBe(true)

    const label = dock.get("[data-dock-pill]").text()
    expect(label.startsWith("Today, ")).toBe(true)
    expect(label).toContain(String(DateTime.now().day))
    expect(label).not.toContain(String(DateTime.now().year))

    await hover(dock, "pointerenter")

    expect(ui.isCalendarDockExpanded).toBe(true)

    const calendar = dock.findComponent(TaskCalendar)
    expect(calendar.exists()).toBe(true)
    expect(calendar.props("selectedDate")).toBe(today)
  })

  it("expands_TC-7_into_two_tabs_on_hover_and_keeps_showing_the_calendar_on_the_days_tab", async () => {
    const {TaskCalendar, mountDock, hover, ui, tasks, milestones} = await setup()
    tasks.activeDay = DateTime.now().toISODate()

    milestones.milestones = [makeMilestone({id: "m1", name: "Launch", progress: {total: 2, resolved: 1}})]
    milestones.isMilestonesLoaded = true

    const dock = await mountDock()
    expect(ui.isCalendarDockExpanded).toBe(false)

    await hover(dock, "pointerenter")

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

    const dock = await mountDock()
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

    const dock = await mountDock()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(ui.isCalendarDockExpanded).toBe(true)

    await dock.get('[data-drop-milestone="m1"]').trigger("click")

    expect(ui.isCalendarDockExpanded).toBe(true)
    expect(filter.activeMilestoneId).toBe("m1")

    ui.toggleCalendarDock(false)
    await nextTick()

    expect(dock.find("[data-dock-pill]").exists()).toBe(true)
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

    const dock = await mountDock()
    await new Promise((resolve) => setTimeout(resolve, 0))

    await dock.get('[data-drop-milestone="m1"]').trigger("click")

    expect(filter.activeMilestoneId).toBeNull()
    expect(filter.frame).toBe("milestone")
    expect(ui.isCalendarDockExpanded).toBe(true)

    ui.toggleCalendarDock(false)
    await nextTick()

    expect(dock.get("[data-dock-pill]").text()).toContain("All milestones")
  })

  it("picks_TC-13_a_day_from_the_calendar_and_stays_expanded", async () => {
    const {mountDock, ui, tasks} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    ui.toggleCalendarDock(true)

    const dock = await mountDock()
    const fifteenth = DateTime.now().set({day: 15}).toISODate()

    await dock.get(`[data-drop-day="${fifteenth}"]`).trigger("click")

    expect(tasks.activeDay).toBe(fifteenth)
    expect(ui.isCalendarDockExpanded).toBe(true)
  })

  it("collapses_TC-14_on_escape_and_when_the_pointer_leaves", async () => {
    const {mountDock, hover, ui} = await setup()
    ui.toggleCalendarDock(true)
    const dock = await mountDock()

    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    expect(ui.isCalendarDockExpanded).toBe(false)

    ui.toggleCalendarDock(true)
    await nextTick()

    await hover(dock, "pointerleave")
    expect(ui.isCalendarDockExpanded).toBe(false)
  })

  it("restores_TC-15_the_pre_drag_state_once_the_drag_ends", async () => {
    const {mountDock, ui, drag} = await setup()
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    await vi.waitFor(() => expect(useSettingsStore().isSettingsLoaded).toBe(true))
    ui.shouldOpenCalendarDockOnDrag = true

    await mountDock()

    expect(ui.isCalendarDockExpanded).toBe(false)

    drag.setDraggingTaskId("task-1")
    expect(ui.isCalendarDockExpanded).toBe(true)

    drag.setDraggingTaskId(null)
    expect(ui.isCalendarDockExpanded).toBe(false)

    ui.toggleCalendarDock(true)
    await nextTick()

    drag.setDraggingTaskId("task-2")
    expect(ui.isCalendarDockExpanded).toBe(true)

    drag.setDraggingTaskId(null)
    expect(ui.isCalendarDockExpanded).toBe(true)
  })

  it("stays_collapsed_on_a_drag_when_auto_open_is_off_and_expands_after_holding_the_card_on_the_pill", async () => {
    const {mountDock, ui, drag} = await setup()
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    await vi.waitFor(() => expect(useSettingsStore().isSettingsLoaded).toBe(true))
    ui.shouldOpenCalendarDockOnDrag = false

    const dock = await mountDock()
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

    const dock = await mountDock()
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

    await mountDock()
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
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    await vi.waitFor(() => expect(useSettingsStore().isSettingsLoaded).toBe(true))
    ui.shouldOpenCalendarDockOnDrag = true

    editor.openNew({branchId: "main"})
    expect(editor.isOpen).toBe(true)

    const dock = await mountDock()

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

    await mountDock()

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

  it("shows_TC-3_the_actions_panel_only_while_the_calendar_is_collapsed_and_lets_new_create_a_task", async () => {
    const {ui, drag} = await setup()
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const {useBranchesStore} = await import("../../../../src/renderer/src/stores/branches.store")
    const {default: CalendarDock} = await import("../../../../src/renderer/src/ui/modules/CalendarDock")
    const actionsDockPath = "../../../../src/renderer/src/ui/modules/ActionsDock/ActionsDock.vue"
    const {default: ActionsDock} = await import(/* @vite-ignore */ actionsDockPath)

    await vi.waitFor(() => expect(useSettingsStore().isSettingsLoaded).toBe(true))
    ui.shouldOpenCalendarDockOnDrag = true

    const branches = useBranchesStore()
    branches.branches = [makeBranch({name: "Nebula"})]

    const dock = mount(CalendarDock, {attachTo: document.body, global: {directives: {tooltip: {}}}})
    const actions = mount(ActionsDock, {attachTo: document.body, global: {directives: {tooltip: {}}}})

    try {
      function expectActionsVisible() {
        expect(actions.find("button").exists()).toBe(true)
        expect(actions.text()).toContain("Nebula")
        expect(actions.text()).toContain("New")
      }

      function expectActionsAbsent() {
        expect(actions.find("button").exists()).toBe(false)
      }

      expect(ui.isCalendarDockExpanded).toBe(false)
      expectActionsVisible()

      ui.toggleCalendarDock(true)
      await nextTick()
      expectActionsAbsent()

      ui.toggleCalendarDock(false)
      await nextTick()
      expectActionsVisible()

      drag.setDraggingTaskId("task-1")
      await nextTick()
      expect(ui.isCalendarDockExpanded).toBe(true)
      expectActionsAbsent()

      drag.setDraggingTaskId(null)
      await nextTick()
      expect(ui.isCalendarDockExpanded).toBe(false)
      expectActionsVisible()

      await actions.findAll("button").at(-1).trigger("click")
      expect(actions.emitted("createTask")).toHaveLength(1)
    } finally {
      dock.unmount()
      actions.unmount()
    }
  })
})
