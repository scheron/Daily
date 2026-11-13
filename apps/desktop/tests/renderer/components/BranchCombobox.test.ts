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
    const {default: BranchCombobox} = await import("../../../src/renderer/src/ui/common/(comboboxes)/BranchCombobox.vue")
    const onSelect = vi.fn()
    const popup = mountInPopup(BranchCombobox, {selectedId: "main", onSelect})
    wrapper = popup.wrapper

    await wrapper.get("input").setValue("Work")
    const createRow = wrapper.findAll("[data-active]").find((row) => row.text().includes("Create"))
    await createRow.trigger("click")

    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id: "p-new", name: "Work"}), {isMulti: false}))
    expect(popup.isOpen.value).toBe(false)
  })

  it("gives_the_all_projects_row_its_own_icon_and_keeps_project_rows_on_the_project_icon", async () => {
    const {default: BranchCombobox} = await import("../../../src/renderer/src/ui/common/(comboboxes)/BranchCombobox.vue")
    const {useBranchesStore} = await import("../../../src/renderer/src/stores/branches")
    useBranchesStore().branches = [makeBranch({id: "leki", name: "Leki"})]
    const popup = mountInPopup(BranchCombobox, {selectedId: "main", hasAllProjects: true})
    wrapper = popup.wrapper

    const rows = wrapper.findAll("[data-active]")
    const iconOf = (row) => row.findAll("use").map((use) => use.attributes("href"))
    expect(iconOf(rows[0])).toContain("#layers")
    expect(iconOf(rows[1])).toContain("#project")
  })

  it("lists_main_as_no_project_and_finds_it_by_that_name", async () => {
    const {default: BranchCombobox} = await import("../../../src/renderer/src/ui/common/(comboboxes)/BranchCombobox.vue")
    const {useBranchesStore} = await import("../../../src/renderer/src/stores/branches")
    useBranchesStore().branches = [makeBranch(), makeBranch({id: "leki", name: "Leki"})]
    const popup = mountInPopup(BranchCombobox, {selectedId: "leki", hasAllProjects: true})
    wrapper = popup.wrapper

    const rows = wrapper.findAll("[data-active]")
    expect(rows.map((row) => row.text())).toEqual(["All projects", "No project", "Leki"])
    expect(rows[1].find('use[href="#project-off"]').exists()).toBe(true)
    expect(rows[2].find('use[href="#project"]').exists()).toBe(true)

    await wrapper.get("input").setValue("no pro")
    expect(wrapper.findAll("[data-active]").map((row) => row.text())).toContain("No project")
  })

  it("renders the saved emoji beside the project name", async () => {
    const {default: BranchCombobox} = await import("../../../src/renderer/src/ui/common/(comboboxes)/BranchCombobox.vue")
    const {useBranchesStore} = await import("../../../src/renderer/src/stores/branches")
    useBranchesStore().branches = [makeBranch({id: "work", name: "Work", emoji: "👩🏽‍💻"})]
    const popup = mountInPopup(BranchCombobox, {selectedId: "work"})
    wrapper = popup.wrapper
    expect(wrapper.text()).toContain("👩🏽‍💻")
    expect(wrapper.find('use[href="#project"]').exists()).toBe(false)
  })

  it("marks_every_row_when_all_projects_is_selected_and_each_chosen_row_otherwise [project-menu#all-is-every-project]", async () => {
    const {default: BranchCombobox} = await import("../../../src/renderer/src/ui/common/(comboboxes)/BranchCombobox.vue")
    const {useBranchesStore} = await import("../../../src/renderer/src/stores/branches")
    useBranchesStore().branches = [makeBranch(), makeBranch({id: "leki", name: "Leki"}), makeBranch({id: "work", name: "Work"})]
    function checked() {
      return wrapper.findAll("[data-active]").map((row) => row.find('use[href="#check"]').exists())
    }

    const popup = mountInPopup(BranchCombobox, {selectedId: "leki", selectedIds: ["main", "work"], hasAllProjects: true})
    wrapper = popup.wrapper
    expect(checked()).toEqual([false, true, false, true])

    await wrapper.setProps({isAllProjectsSelected: true})
    expect(checked()).toEqual([true, true, true, true])
  })

  it("keeps_the_menu_open_on_cmd_click_only_when_multi_select_is_on [project-menu#cmd-multi-select]", async () => {
    const {default: BranchCombobox} = await import("../../../src/renderer/src/ui/common/(comboboxes)/BranchCombobox.vue")
    const {useBranchesStore} = await import("../../../src/renderer/src/stores/branches")
    useBranchesStore().branches = [makeBranch(), makeBranch({id: "leki", name: "Leki"})]
    const onSelect = vi.fn()
    const popup = mountInPopup(BranchCombobox, {selectedId: "main", isMultiSelect: true, onSelect})
    wrapper = popup.wrapper
    function rowOf(name) {
      return wrapper.findAll("[data-active]").find((row) => row.text() === name)
    }

    await rowOf("Leki").trigger("click", {metaKey: true})
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({id: "leki"}), {isMulti: true})
    expect(popup.isOpen.value).toBe(true)

    await rowOf("Leki").trigger("click")
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({id: "leki"}), {isMulti: false})
    expect(popup.isOpen.value).toBe(false)
  })

  it("closes_on_cmd_click_when_multi_select_is_off [project-menu#cmd-multi-select]", async () => {
    const {default: BranchCombobox} = await import("../../../src/renderer/src/ui/common/(comboboxes)/BranchCombobox.vue")
    const {useBranchesStore} = await import("../../../src/renderer/src/stores/branches")
    useBranchesStore().branches = [makeBranch(), makeBranch({id: "leki", name: "Leki"})]
    const onSelect = vi.fn()
    const popup = mountInPopup(BranchCombobox, {selectedId: "main", onSelect})
    wrapper = popup.wrapper

    await wrapper
      .findAll("[data-active]")
      .find((row) => row.text() === "Leki")
      .trigger("click", {metaKey: true})

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id: "leki"}), {isMulti: false})
    expect(popup.isOpen.value).toBe(false)
  })
})
