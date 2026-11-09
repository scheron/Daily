import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {toAcceleratorKeyCaps} from "./toAcceleratorKeyCaps"

import type {ShortcutAction} from "@shared/types/shortcuts"

/** @example toShortcutKeyCaps("ui:open-assistant-panel") // ["⌘", "⇧", "A"] */
export function toShortcutKeyCaps(action: ShortcutAction): string[] {
  return toAcceleratorKeyCaps(SHORTCUTS_MAP[action].accelerator)
}
