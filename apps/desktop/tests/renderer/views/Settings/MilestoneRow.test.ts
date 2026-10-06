// @vitest-environment happy-dom
// @ts-nocheck
import {defineComponent, nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import {makeTask} from "../../../helpers/boardDrag"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

const PopupStub = defineComponent({template: "<div><slot name='default' :hide='() => {}' /></div>"})

describe("MilestoneRow", () => {
  it("marks_only_the_days_of_the_milestones_own_project_with_all_projects_on", async () => {
    mockBridgeIPC()
    setActivePinia(createPinia())

    const {default: MilestoneRow} =
      await import("../../../../src/renderer/src/ui/views/Settings/{fragments}/ProjectsSettings/{fragments}/MilestonesForm/{fragments}/MilestoneRow.vue")
    const {default: TaskCalendar} = await import("../../../../src/renderer/src/ui/common/calendar/TaskCalendar")
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks")

    const settingsStore = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve, 20))
    settingsStore.settings = {branch: {activeId: "main", isAllProjects: true}, layout: {sectionsCollapsed: {}}}
    const day = (date) => ({date, time: "09:00", timezone: "UTC"})
    useTasksStore().tasks = [
      makeTask("a", {branchId: "main", scheduled: day("2026-10-01")}),
      makeTask("b", {branchId: "leki", scheduled: day("2026-10-02")}),
    ]

    const milestone = {
      id: "m1",
      branchId: "leki",
      name: "Launch",
      description: "",
      targetDate: null,
      progress: {total: 0, done: 0, active: 0, discarded: 0, backlog: 0},
    }
    const wrapper = mount(MilestoneRow, {props: {milestone, expanded: false}, global: {stubs: {BasePopup: PopupStub}, directives: {tooltip: {}}}})
    await nextTick()

    const dates = wrapper
      .findComponent(TaskCalendar)
      .props("days")
      .map((day) => day.date)
    expect(dates).toEqual(["2026-10-02"])
    wrapper.unmount()
  })
})
