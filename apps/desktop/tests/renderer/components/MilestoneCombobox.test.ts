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
    status: "in_progress",
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

async function mountCombobox(task, milestones = [makeMilestone()]) {
  const {default: MilestoneCombobox} = await import("../../../src/renderer/src/ui/common/(comboboxes)/MilestoneCombobox.vue")
  const {useMilestonesStore} = await import("../../../src/renderer/src/stores/milestones")
  const store = useMilestonesStore()
  vi.spyOn(store, "milestonesForBranch").mockReturnValue(milestones.map((m) => ({...m, progress: {done: 0, total: 0}})))
  const onUpdate = vi.fn()
  const popup = mountInPopup(MilestoneCombobox, {task, onUpdate})
  return {...popup, onUpdate}
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
    const {default: MilestoneCombobox} = await import("../../../src/renderer/src/ui/common/(comboboxes)/MilestoneCombobox.vue")
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

  it("lists_no_milestone_first_checked_when_the_task_has_none_[menus#no-milestone-row]", async () => {
    const popup = await mountCombobox(makeTask())
    wrapper = popup.wrapper

    const rows = wrapper.findAll("[data-active]")
    expect(rows.map((row) => row.text())).toEqual(["No milestone", "Launch"])
    expect(rows.map((row) => row.find('use[href="#check"]').exists())).toEqual([true, false])
  })

  it("selecting_no_milestone_clears_the_milestone_[menus#no-milestone-row]", async () => {
    const popup = await mountCombobox(makeTask({milestoneId: "milestone-1"}))
    wrapper = popup.wrapper

    await wrapper.findAll("[data-active]")[0].trigger("click")

    expect(popup.onUpdate).toHaveBeenCalledWith(null)
  })

  it("clicking_the_checked_milestone_reports_nothing_and_closes_the_menu_[menus#no-milestone-row]", async () => {
    const popup = await mountCombobox(makeTask({milestoneId: "milestone-1"}))
    wrapper = popup.wrapper

    await wrapper.findAll("[data-active]")[1].trigger("click")

    expect(popup.onUpdate).not.toHaveBeenCalled()
    expect(popup.isOpen.value).toBe(false)
  })

  it("keeps_no_milestone_for_a_partial_query_and_offers_no_create_row_for_its_exact_name_[menus#no-milestone-row]", async () => {
    const popup = await mountCombobox(makeTask())
    wrapper = popup.wrapper

    await wrapper.get("input").setValue("no mil")
    expect(wrapper.findAll("[data-active]")[0].text()).toBe("No milestone")

    await wrapper.get("input").setValue("Launch")
    expect(wrapper.findAll("[data-active]").some((row) => row.text() === "No milestone")).toBe(false)

    await wrapper.get("input").setValue("No milestone")
    expect(wrapper.findAll("[data-active]").map((row) => row.text())).toEqual(["No milestone"])
  })
})
