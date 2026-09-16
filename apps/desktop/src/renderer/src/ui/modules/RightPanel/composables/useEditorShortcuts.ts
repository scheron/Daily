import {useEventListener} from "@vueuse/core"

import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {acceleratorsMatch} from "@shared/utils/shortcuts/acceleratorsMatch"
import {formatEventToAccelerator} from "@shared/utils/shortcuts/formatEventToAccelerator"
import {useTaskEditor} from "./useTaskEditor"

export function useEditorShortcuts() {
  const {isOpen, canSave, close, commitDraft, commitDraftAndClose} = useTaskEditor()

  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    const pressed = formatEventToAccelerator(event)
    if (!pressed || !isOpen.value) return

    if (acceleratorsMatch(pressed, SHORTCUTS_MAP["editor:close"].accelerator)) {
      if (event.defaultPrevented) return
      close()
    } else if (acceleratorsMatch(pressed, SHORTCUTS_MAP["editor:save"].accelerator)) {
      if (canSave.value) commitDraft()
    } else if (acceleratorsMatch(pressed, SHORTCUTS_MAP["editor:save-close"].accelerator)) {
      if (canSave.value) commitDraftAndClose()
    } else {
      return
    }

    event.preventDefault()
  })
}
