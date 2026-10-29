import {ref} from "vue"

const isSubtaskEditorOpen = ref(false)

/**
 * Whether a subtask editor is mounted. The panel's Esc reads it to leave Esc to that editor.
 */
export function useSubtaskEditorOpen() {
  return isSubtaskEditorOpen
}
