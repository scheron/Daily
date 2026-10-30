// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const shown = vi.hoisted(() => ({props: null}))

vi.mock("../../../src/renderer/src/ui/base/BaseModal", () => ({
  useBaseModal: () => ({
    show: (_component, props) => (shown.props = props),
    hide: vi.fn(),
  }),
}))
vi.mock("../../../src/renderer/src/ui/overlays/ConfirmUnsavedModal/ConfirmUnsavedModal.vue", () => ({default: {}}))

describe("useConfirmUnsavedModal", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    shown.props = null
  })

  async function setup(content) {
    const {useTaskEditorStore} = await import("../../../src/renderer/src/stores/task-editor")
    const {useConfirmUnsavedModal} = await import("../../../src/renderer/src/ui/overlays/ConfirmUnsavedModal/useConfirmUnsavedModal")
    const editor = useTaskEditorStore()
    editor.commit = vi.fn().mockResolvedValue(undefined)
    editor.openNew({branchId: "main"})
    editor.patch({content})
    editor.addPendingSubtask("a")
    const promise = useConfirmUnsavedModal().open()
    return {editor, promise}
  }

  it("does_not_create_a_task_without_a_description", async () => {
    const {editor} = await setup("  ")

    expect(shown.props.canSave).toBe(false)
    await shown.props.onSave()

    expect(editor.commit).not.toHaveBeenCalled()
  })

  it("saves_a_draft_that_has_a_description", async () => {
    const {editor, promise} = await setup("text")

    expect(shown.props.canSave).toBe(true)
    await shown.props.onSave()

    expect(editor.commit).toHaveBeenCalled()
    await expect(promise).resolves.toBe(true)
  })
})
