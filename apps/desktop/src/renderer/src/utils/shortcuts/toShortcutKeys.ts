import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {toAcceleratorKeyCaps} from "./toAcceleratorKeyCaps"

import type {ShortcutAction} from "@shared/types/shortcuts"

/** @example toShortcutKeys("ui:open-search-panel") // "⌘ F" */
export function toShortcutKeys(action: ShortcutAction): string {
  return toShortcutKeyCaps(action).join(" ")
}

/** @example toShortcutKeyCaps("ui:open-assistant-panel") // ["⌘", "⇧", "A"] */
export function toShortcutKeyCaps(action: ShortcutAction): string[] {
  return toAcceleratorKeyCaps(SHORTCUTS_MAP[action].accelerator)
}
