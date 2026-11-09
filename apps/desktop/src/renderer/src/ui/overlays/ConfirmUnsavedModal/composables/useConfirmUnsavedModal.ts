import {withResolvers} from "@daily/std"

import {useBaseModal} from "@/composables/useBaseModal"
import {useTaskEditorStore} from "@/stores/task-editor"
import ConfirmUnsavedModal from "../ConfirmUnsavedModal.vue"

export function useConfirmUnsavedModal() {
  const taskEditorStore = useTaskEditorStore()

  let {promise, resolve} = withResolvers<boolean>()

  const {show, hide} = useBaseModal("confirm-unsaved")

  function open(): Promise<boolean> {
    if (!taskEditorStore.isDirty) return Promise.resolve(true)
    ;({promise, resolve} = withResolvers<boolean>())

    const canSave = (taskEditorStore.draft?.content.trim().length ?? 0) > 0

    show(ConfirmUnsavedModal, {
      canSave,
      onSave: async () => {
        if (!canSave) return
        if (!(await taskEditorStore.commit())) return
        hide()
        resolve(true)
      },
      onDiscard: () => {
        taskEditorStore.discard()
        hide()
        resolve(true)
      },
      onCancel: close,
      onClose: close,
    })

    return promise
  }

  function close() {
    hide()
    resolve(false)
  }

  return {open}
}
