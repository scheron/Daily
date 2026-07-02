import {withResolvers} from "@shared/utils/common/withResolvers"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useBaseModal} from "@/ui/base/BaseModal"

import ConfirmUnsavedModal from "./ConfirmUnsavedModal.vue"

const CONFIRM_UNSAVED_MODAL_ID = "confirm-unsaved"

/**
 * Guards navigation away from a dirty task editor. `open()` resolves `true` when it is safe
 * to proceed (no unsaved changes, or the user saved/discarded) and `false` when cancelled.
 *
 * @example
 * const {open} = useConfirmUnsavedModal()
 * if (await open()) openNext()
 */
export function useConfirmUnsavedModal() {
  const taskEditorStore = useTaskEditorStore()
  const {show, hide, isOpen} = useBaseModal(CONFIRM_UNSAVED_MODAL_ID)

  let {promise, resolve} = withResolvers<boolean>()

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
      onCancel: () => {
        hide()
        resolve(false)
      },
      onClose: () => {
        hide()
        resolve(false)
      },
    })

    return promise
  }

  function close() {
    hide()
    resolve(false)
  }

  return {isOpen, open, close}
}
