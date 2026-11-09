import {toShortcutKeyCaps} from "./toShortcutKeyCaps"

import type {ShortcutAction} from "@shared/types/shortcuts"

/** @example toShortcutKeys("ui:open-search-panel") // "⌘ F" */
export function toShortcutKeys(action: ShortcutAction): string {
  return toShortcutKeyCaps(action).join(" ")
}
