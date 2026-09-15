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
})
