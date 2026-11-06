// @vitest-environment happy-dom
// @ts-nocheck
import {defineComponent} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {flushPromises, mount} from "@vue/test-utils"
import ProjectEmojiPicker from "../../../../src/renderer/src/ui/views/Settings/{fragments}/ProjectsSettings/{fragments}/ProjectsForm/{fragments}/ProjectEmojiPicker.vue"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

import type {Branch} from "@daily/protocol"

function makeProject(overrides: Partial<Branch> = {}): Branch {
  return {
    id: "work",
    name: "Work",
    description: "",
    emoji: "💼",
    createdAt: "2026-11-06T00:00:00.000Z",
    updatedAt: "2026-11-06T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

const button = (label) => document.querySelector(`button[aria-label="${label}"]`)

async function click(label) {
  button(label).click()
  await flushPromises()
}

const pickerStub = defineComponent({
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: '<button aria-label="Choose project emoji">{{ modelValue }}</button>',
})

async function chooseEmoji(wrapper, emoji) {
  wrapper.findComponent(ProjectEmojiPicker).vm.$emit("update:modelValue", emoji)
  await flushPromises()
}

describe("ProjectsForm", () => {
  let wrapper
  let bridge

  beforeEach(async () => {
    bridge = mockBridgeIPC({
      "branches:create": vi.fn(async (draft) => makeProject({...draft, id: "created"})),
      "branches:update": vi.fn(async (id, updates) => makeProject({id, ...updates})),
    })
    setActivePinia(createPinia())
    const {useBranchesStore} = await import("../../../../src/renderer/src/stores/branches.store")
    useBranchesStore().branches = [makeProject({id: "main", name: "Main", emoji: "🚀"}), makeProject()]
    const {default: ProjectsForm} =
      await import("../../../../src/renderer/src/ui/views/Settings/{fragments}/ProjectsSettings/{fragments}/ProjectsForm")
    wrapper = mount(ProjectsForm, {
      attachTo: document.body,
      props: {selectedId: "work"},
      global: {directives: {tooltip: {}}, stubs: {ProjectEmojiPicker: pickerStub}},
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    document.body.innerHTML = ""
  })

  it("shows only the create editor until it is cancelled, then restores every project control", async () => {
    await wrapper.get("button").trigger("click")

    expect(wrapper.findAll("button").some((control) => control.text().endsWith("Work"))).toBe(false)
    expect(wrapper.findAll("button").some((control) => control.text() === "No project")).toBe(false)
    expect(button("Edit Work")).toBeNull()
    expect(button("Choose project emoji")).not.toBeNull()
    expect(button("Create project")).not.toBeNull()

    await click("Cancel creating project")

    expect(wrapper.findAll("button").some((control) => control.text() === "New project")).toBe(true)
    expect(wrapper.findAll("button").some((control) => control.text().endsWith("Work"))).toBe(true)
    expect(wrapper.findAll("button").some((control) => control.text() === "No project")).toBe(true)
    expect(button("Edit Work")).not.toBeNull()
    expect(bridge["branches:create"]).not.toHaveBeenCalled()
  })

  it("shows only the edit editor until it is cancelled, then restores every project control", async () => {
    await click("Edit Work")

    expect(wrapper.findAll("button").some((control) => control.text() === "New project")).toBe(false)
    expect(wrapper.findAll("button").some((control) => control.text() === "No project")).toBe(false)
    expect(wrapper.findAll("button").some((control) => control.text().endsWith("Work"))).toBe(false)
    expect(button("Choose project emoji")).not.toBeNull()
    expect(button("Save project")).not.toBeNull()

    await click("Cancel editing project")

    expect(wrapper.findAll("button").some((control) => control.text() === "New project")).toBe(true)
    expect(wrapper.findAll("button").some((control) => control.text() === "No project")).toBe(true)
    expect(wrapper.findAll("button").some((control) => control.text().endsWith("Work"))).toBe(true)
    expect(button("Edit Work")).not.toBeNull()
    expect(bridge["branches:update"]).not.toHaveBeenCalled()
  })

  it("restores the project list after saving either editor", async () => {
    await wrapper.get("button").trigger("click")
    await wrapper.get('input[placeholder="New project"]').setValue("Team")
    await click("Create project")

    expect(bridge["branches:create"]).toHaveBeenCalledExactlyOnceWith({name: "Team", description: "", emoji: null})
    expect(wrapper.find('input[placeholder="New project"]').exists()).toBe(false)
    expect(wrapper.findAll("button").some((control) => control.text() === "New project")).toBe(true)
    expect(wrapper.findAll("button").some((control) => control.text().endsWith("Work"))).toBe(true)
    expect(button("Edit Work")).not.toBeNull()

    await click("Edit Work")
    await wrapper.get('input[aria-label="Project name"]').setValue("Studio")
    await click("Save project")

    expect(wrapper.findAll("button").some((control) => control.text() === "New project")).toBe(true)
    expect(bridge["branches:update"]).toHaveBeenCalledExactlyOnceWith("work", {name: "Studio", emoji: "💼"})
    expect(wrapper.find('input[aria-label="Project name"]').exists()).toBe(false)
    expect(wrapper.findAll("button").some((control) => control.text().endsWith("Work"))).toBe(true)
    expect(wrapper.findAll("button").some((control) => control.text() === "No project")).toBe(true)
    expect(button("Edit Work")).not.toBeNull()
  })

  it("saves a selected compound emoji and trimmed name in the same create operation", async () => {
    await wrapper.get("button").trigger("click")
    await wrapper.get('input[placeholder="New project"]').setValue("  Team  ")
    await chooseEmoji(wrapper, "👩🏽‍💻")
    expect(bridge["branches:create"]).not.toHaveBeenCalled()
    await click("Create project")
    expect(bridge["branches:create"]).toHaveBeenCalledExactlyOnceWith({name: "Team", description: "", emoji: "👩🏽‍💻"})
  })

  it("edits name and emoji atomically and can restore the standard icon", async () => {
    await click("Edit Work")
    await wrapper.get('input[aria-label="Project name"]').setValue("Studio")
    await chooseEmoji(wrapper, "🚀")
    await click("Save project")
    expect(bridge["branches:update"]).toHaveBeenCalledExactlyOnceWith("work", {name: "Studio", emoji: "🚀"})
    bridge["branches:update"].mockClear()
    await click("Edit Work")
    await chooseEmoji(wrapper, null)
    await click("Save project")
    expect(bridge["branches:update"]).toHaveBeenCalledExactlyOnceWith("work", {name: "Work", emoji: null})
  })

  it("cancels edit and create drafts without changing saved projects", async () => {
    await click("Edit Work")
    await chooseEmoji(wrapper, "🚀")
    await click("Cancel editing project")
    expect(bridge["branches:update"]).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain("💼")
    await wrapper.get("button").trigger("click")
    await chooseEmoji(wrapper, "🚀")
    await wrapper.get('input[placeholder="New project"]').trigger("keyup", {key: "Escape"})
    expect(bridge["branches:create"]).not.toHaveBeenCalled()
    await wrapper.get("button").trigger("click")
    expect(button("Choose project emoji").textContent).not.toContain("🚀")
  })

  it("keeps an emoji-only edit as a draft until the project is saved", async () => {
    await click("Edit Work")
    await chooseEmoji(wrapper, "🦄")
    expect(bridge["branches:update"]).not.toHaveBeenCalled()
    expect(button("Save project")).not.toBeNull()
    await click("Save project")
    expect(bridge["branches:update"]).toHaveBeenCalledExactlyOnceWith("work", {name: "Work", emoji: "🦄"})
  })

  it("saves a selected flag while preserving the system project icon", async () => {
    expect(wrapper.find('use[href="#project-off"]').exists()).toBe(true)
    await click("Edit Work")
    await chooseEmoji(wrapper, "🇷🇺")
    await click("Save project")
    expect(bridge["branches:update"]).toHaveBeenCalledWith("work", {name: "Work", emoji: "🇷🇺"})
  })
})
