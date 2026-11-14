// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {makeTask} from "../../../helpers/taskFixtures"

describe("MilestoneProperty", () => {
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
    const {default: MilestoneProperty} =
      await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Details/{fragments}/(properties)/MilestoneProperty.vue")
    const {default: PropertyCell} =
      await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Details/{fragments}/PropertyCell.vue")
    const {useMilestonesStore} = await import("../../../../src/renderer/src/stores/milestones")
    useMilestonesStore().milestones = [{id: "m1", branchId: "main", name: "Beta", deletedAt: null}]

    wrapper = mount(MilestoneProperty, {props: {task}, global: {directives: {tooltip: {}}}})
    return wrapper.findComponent(PropertyCell)
  }

  it("shows_a_task_without_a_milestone_as_a_muted_no_milestone", async () => {
    const cell = await setup(makeTask())

    expect(cell.props()).toEqual({label: "No milestone", isEmpty: true})
  })

  it("names_the_milestone_of_the_task", async () => {
    const cell = await setup(makeTask({milestoneId: "m1"}))

    expect(cell.props()).toEqual({label: "Beta", isEmpty: false})
  })
})
