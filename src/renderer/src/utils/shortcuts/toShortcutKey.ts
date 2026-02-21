import {ShortcutsMap} from "@shared/constants/shortcuts"

import {formatAccelerator} from "./formatAccelerator"

import type {ShortcutAction} from "@shared/types/shortcuts"

/**
 * Converts a shortcut action to a shortcut key.
 * @example
 * toShortcutKeys("ui:toggle-sidebar") // ⌘ I
 */
export function toShortcutKeys(action: ShortcutAction): string {
  return formatAccelerator(ShortcutsMap[action].accelerator)
}
