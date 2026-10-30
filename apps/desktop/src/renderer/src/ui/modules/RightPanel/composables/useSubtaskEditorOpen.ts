import {computed, ref} from "vue"

import {nestedTarget} from "./useNestedView"

import type {Subtask} from "@daily/protocol"

const isSubtaskEditorOpen = ref(false)

export const openedSubtaskId = computed<Subtask["id"] | null>({
  get: () => (nestedTarget.value?.kind === "subtask" ? nestedTarget.value.id : null),
  set: (id) => {
    if (id) nestedTarget.value = {kind: "subtask", id}
    else if (nestedTarget.value?.kind === "subtask") nestedTarget.value = null
  },
})

export function useSubtaskEditorOpen() {
  return isSubtaskEditorOpen
}

export function openSubtask(id: Subtask["id"]) {
  openedSubtaskId.value = id
}
