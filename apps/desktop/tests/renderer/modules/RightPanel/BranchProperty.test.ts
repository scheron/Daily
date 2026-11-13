// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    branchId: "main",
    milestoneId: null,
    status: "in_progress",
    content: "task",
    priority: "none",
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

describe("BranchProperty", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function setup(task) {
    const {default: BranchProperty} =
      await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Details/{fragments}/(properties)/BranchProperty.vue")
    const {default: PropertyCell} =
      await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Details/{fragments}/PropertyCell.vue")
    const {useBranchesStore} = await import("../../../../src/renderer/src/stores/branches")
    useBranchesStore().branches = [
      {id: "main", name: "Main"},
      {id: "leki", name: "Leki", emoji: "💼"},
    ]

    wrapper = mount(BranchProperty, {props: {task}, global: {directives: {tooltip: {}}}})
    return wrapper.findComponent(PropertyCell)
  }

  it("shows_a_task_in_main_as_a_muted_no_project_rather_than_by_the_name_main", async () => {
    const cell = await setup(makeTask())

    expect(cell.props()).toEqual({label: "No project", isEmpty: true})
  })

  it("names_a_project_of_the_person_own", async () => {
    const cell = await setup(makeTask({branchId: "leki"}))

    expect(cell.props()).toEqual({label: "Leki", isEmpty: false})
    expect(cell.text()).toContain("💼")
  })

  it("clears_the_project_and_milestone_when_no_project_is_picked_from_the_list", async () => {
    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    const taskEditorStore = useTaskEditorStore()
    taskEditorStore.openNew({branchId: "leki", milestoneId: "milestone-1"})
    const cell = await setup(taskEditorStore.draft)

    await cell.trigger("click")
    const rows = document.body.querySelectorAll("[data-active]")
    expect(rows[0].textContent).toContain("No project")
    rows[0].click()
    await wrapper.vm.$nextTick()

    expect(taskEditorStore.draft).toMatchObject({branchId: "main", milestoneId: null})
  })
})
