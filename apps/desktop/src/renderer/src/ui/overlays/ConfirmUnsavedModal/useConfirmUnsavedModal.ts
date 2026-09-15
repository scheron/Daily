import {withResolvers} from "@daily/std"

import {useTaskEditorStore} from "@/stores/task-editor"
import {useBaseModal} from "@/ui/base/BaseModal"
import ConfirmUnsavedModal from "./ConfirmUnsavedModal.vue"

export function useConfirmUnsavedModal() {
  const taskEditorStore = useTaskEditorStore()

  let {promise, resolve} = withResolvers<boolean>()

  const {show, hide} = useBaseModal("confirm-unsaved")

  function open(): Promise<boolean> {
    if (!taskEditorStore.isDirty) return Promise.resolve(true)
    ;({promise, resolve} = withResolvers<boolean>())

    show(ConfirmUnsavedModal, {
      onSave: async () => {
        await taskEditorStore.commit()
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
