// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {mountInPopup} from "../../helpers/mountInPopup"

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

describe("BranchCombobox", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC({
      "branches:create": vi.fn(async (draft) => makeBranch({...draft, id: "p-new"})),
    })
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it("creates_a_project_selects_it_and_only_then_closes_the_popup", async () => {
    const {default: BranchCombobox} = await import("../../../src/renderer/src/ui/common/comboboxes/BranchCombobox.vue")
    const onSelect = vi.fn()
    const popup = mountInPopup(BranchCombobox, {selectedId: "main", onSelect})
    wrapper = popup.wrapper

    await wrapper.get("input").setValue("Work")
    const createRow = wrapper.findAll("[data-active]").find((row) => row.text().includes("Create"))
    await createRow.trigger("click")

    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id: "p-new", name: "Work"})))
    expect(popup.isOpen.value).toBe(false)
  })

  it("gives_the_all_projects_row_its_own_icon_and_keeps_project_rows_on_the_project_icon", async () => {
    const {default: BranchCombobox} = await import("../../../src/renderer/src/ui/common/comboboxes/BranchCombobox.vue")
    const {useBranchesStore} = await import("../../../src/renderer/src/stores/branches.store")
    useBranchesStore().branches = [makeBranch()]
    const popup = mountInPopup(BranchCombobox, {selectedId: "main", hasAllProjects: true})
    wrapper = popup.wrapper

    const rows = wrapper.findAll("[data-active]")
    const iconOf = (row) => row.findAll("use").map((use) => use.attributes("href"))
    expect(iconOf(rows[0])).toContain("#layers")
    expect(iconOf(rows[1])).toContain("#project")
  })
})
