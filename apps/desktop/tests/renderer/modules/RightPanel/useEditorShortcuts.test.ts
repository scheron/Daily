// @vitest-environment happy-dom
// @ts-nocheck
import {defineComponent, ref} from "vue"
import {afterEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"

const close = vi.fn()

vi.mock("../../../../src/renderer/src/ui/modules/RightPanel/composables/useTaskEditor", () => ({
  useTaskEditor: () => ({isOpen: ref(true), canSave: ref(false), close, commitDraft: vi.fn(), commitDraftAndClose: vi.fn()}),
}))

describe("useEditorShortcuts", () => {
  let wrapper = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    close.mockClear()
  })

  async function setup() {
    const {useEditorShortcuts} = await import("../../../../src/renderer/src/ui/modules/RightPanel/composables/useEditorShortcuts")
    const {useSubtaskEditorOpen} = await import("../../../../src/renderer/src/ui/modules/RightPanel/composables/useSubtaskEditorOpen")
    wrapper = mount(defineComponent({setup: () => (useEditorShortcuts(), {}), template: "<div />"}))
    return useSubtaskEditorOpen()
  }

  function pressEscape() {
    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", cancelable: true}))
  }

  it("closes_the_panel_on_escape", async () => {
    const isSubtaskEditorOpen = await setup()
    isSubtaskEditorOpen.value = false

    pressEscape()

    expect(close).toHaveBeenCalledTimes(1)
  })

  it("leaves_escape_alone_while_a_subtask_editor_is_open", async () => {
    const isSubtaskEditorOpen = await setup()
    isSubtaskEditorOpen.value = true

    pressEscape()

    expect(close).not.toHaveBeenCalled()
    isSubtaskEditorOpen.value = false
  })

  it("goes_back_from_a_subtask_on_escape_and_closes_on_the_next", async () => {
    await setup()
    const {openedSubtaskId} = await import("../../../../src/renderer/src/ui/modules/RightPanel/composables/useSubtaskEditorOpen")
    openedSubtaskId.value = "s1"

    pressEscape()
    expect(openedSubtaskId.value).toBe(null)
    expect(close).not.toHaveBeenCalled()

    pressEscape()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
