import {ref} from "vue"

import type {Subtask} from "@daily/protocol"

const isSubtaskEditorOpen = ref(false)

/** The subtask whose view replaces the task in the panel, or null while the task shows. */
export const openedSubtaskId = ref<Subtask["id"] | null>(null)

/**
 * Whether a subtask is being edited inline. The panel's Esc reads it to leave Esc to that field.
 */
export function useSubtaskEditorOpen() {
  return isSubtaskEditorOpen
}

/** Asks the panel to show a subtask in place of the task. */
export function openSubtask(id: Subtask["id"]) {
  openedSubtaskId.value = id
}
