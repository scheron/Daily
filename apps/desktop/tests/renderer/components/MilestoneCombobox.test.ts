// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {mountInPopup} from "../../helpers/mountInPopup"

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
    ...overrides,
  }
}

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    status: "active",
    content: "Test",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    milestoneId: null,
    tags: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("MilestoneCombobox", () => {
  let bridge = null
  let wrapper = null

  beforeEach(() => {
    bridge = mockBridgeIPC({
      "milestones:create": vi.fn(async (draft) => ({milestones: {upserted: [makeMilestone({...draft, id: "m-new"})]}})),
    })
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it("creates_a_milestone_in_the_tasks_project_selects_it_and_only_then_closes_the_popup", async () => {
    const {default: MilestoneCombobox} = await import("../../../src/renderer/src/ui/common/comboboxes/MilestoneCombobox.vue")
    const onUpdate = vi.fn()
    const popup = mountInPopup(MilestoneCombobox, {task: makeTask({branchId: "work"}), onUpdate})
    wrapper = popup.wrapper

    await wrapper.get("input").setValue("Launch")
    const createRow = wrapper.findAll("[data-active]").find((row) => row.text().includes("Create"))
    await createRow.trigger("click")

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith("m-new"))
    expect(popup.isOpen.value).toBe(false)
    expect(bridge["milestones:create"]).toHaveBeenCalledWith(expect.objectContaining({name: "Launch", branchId: "work"}))
  })
})
