import {useFocusStore} from "@/stores/focus.store"

import type {FocusCommand} from "@shared/types/focus"

export function useClickCommand() {
  const focusStore = useFocusStore()

  function sendOnClick(event: MouseEvent, command: FocusCommand) {
    if (event.detail > 1) return
    focusStore.dispatch(command)
  }

  return {sendOnClick}
}
