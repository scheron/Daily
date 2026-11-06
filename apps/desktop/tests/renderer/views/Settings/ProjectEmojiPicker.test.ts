// @vitest-environment happy-dom
// @ts-nocheck
import {afterEach, describe, expect, it, vi} from "vitest"

import {flushPromises, mount} from "@vue/test-utils"
import ProjectEmojiPicker from "../../../../src/renderer/src/ui/views/Settings/{fragments}/ProjectsSettings/{fragments}/ProjectsForm/{fragments}/ProjectEmojiPicker.vue"

describe("ProjectEmojiPicker", () => {
  let wrapper

  afterEach(() => {
    wrapper?.unmount()
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  it("searches the bundled catalog and selects an emoji outside the old shortcuts without a network request", async () => {
    const fetch = vi.spyOn(window, "fetch")
    wrapper = mount(ProjectEmojiPicker, {attachTo: document.body, props: {modelValue: null}, global: {directives: {tooltip: {}}}})
    await wrapper.get('button[aria-label="Choose project emoji"]').trigger("click")
    await vi.waitFor(() => expect(document.querySelector("em-emoji-picker")?.shadowRoot?.querySelector('input[type="search"]')).toBeTruthy())
    const picker = document.querySelector("em-emoji-picker")
    const search = picker.shadowRoot.querySelector('input[type="search"]')
    search.value = "unicorn"
    search.dispatchEvent(new Event("input", {bubbles: true}))
    await vi.waitFor(() => expect(picker.shadowRoot.querySelector('button[aria-label="🦄"]')).toBeTruthy())
    picker.shadowRoot.querySelector('button[aria-label="🦄"]').click()
    await flushPromises()
    expect(wrapper.emitted("update:modelValue")).toEqual([["🦄"]])
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("opens from the keyboard, traps focus at its boundary, and Escape returns focus without changing the emoji", async () => {
    wrapper = mount(ProjectEmojiPicker, {attachTo: document.body, props: {modelValue: "💼"}, global: {directives: {tooltip: {}}}})
    const trigger = wrapper.get('button[aria-label="Choose project emoji"]').element
    trigger.focus()
    trigger.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))
    await vi.waitFor(() => expect(document.querySelector("em-emoji-picker")?.shadowRoot?.activeElement?.tagName).toBe("INPUT"))
    const picker = document.querySelector("em-emoji-picker")
    const search = picker.shadowRoot.querySelector('input[type="search"]')
    const reset = document.querySelector('button[aria-label="Use default project icon"]')
    search.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", shiftKey: true, bubbles: true, composed: true, cancelable: true}))
    expect(document.activeElement).toBe(reset)
    reset.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true, composed: true, cancelable: true}))
    expect(picker.shadowRoot.activeElement).toBe(search)
    search.value = "unicorn"
    search.dispatchEvent(new Event("input", {bubbles: true}))
    await flushPromises()
    search.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true}))
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
  })

  it("restores the default icon and returns focus to the trigger", async () => {
    wrapper = mount(ProjectEmojiPicker, {attachTo: document.body, props: {modelValue: "💼"}, global: {directives: {tooltip: {}}}})
    const trigger = wrapper.get('button[aria-label="Choose project emoji"]').element
    trigger.click()
    await flushPromises()
    document.querySelector('button[aria-label="Use default project icon"]').click()
    await flushPromises()
    expect(wrapper.emitted("update:modelValue")).toEqual([[null]])
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it.each(["Enter", "Space", "Tab"])("keeps focus inside after committing a skin tone with %s so Escape still closes it", async (code) => {
    wrapper = mount(ProjectEmojiPicker, {attachTo: document.body, props: {modelValue: "💼"}, global: {directives: {tooltip: {}}}})
    const trigger = wrapper.get('button[aria-label="Choose project emoji"]').element
    trigger.click()
    await vi.waitFor(() => expect(document.querySelector("em-emoji-picker")?.shadowRoot?.querySelector(".skin-tone-button")).toBeTruthy())
    const picker = document.querySelector("em-emoji-picker")
    const toggle = picker.shadowRoot.querySelector(".skin-tone-button")
    toggle.focus()
    toggle.click()
    await vi.waitFor(() => expect(picker.shadowRoot.activeElement?.matches('input[name="skin-tone"]')).toBe(true))
    const light = picker.shadowRoot.querySelector('input[name="skin-tone"][value="2"]')
    light.focus()
    light.checked = true
    light.dispatchEvent(new Event("change", {bubbles: true}))
    light.dispatchEvent(new KeyboardEvent("keydown", {key: code === "Space" ? " " : code, code, bubbles: true, composed: true, cancelable: true}))
    await vi.waitFor(() => expect(picker.shadowRoot.querySelector('[role="radiogroup"]')).toBeNull())
    expect(picker.shadowRoot.activeElement).toBe(toggle)
    expect(toggle.querySelector(".skin-tone-2")).not.toBeNull()
    picker.shadowRoot.activeElement.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, composed: true}))
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
  })
})
