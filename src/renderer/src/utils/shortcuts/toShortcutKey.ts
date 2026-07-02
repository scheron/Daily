import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {parseAccelerator} from "@shared/utils/shortcuts/parseAccelerator"
import {devicePlatform} from "@/constants/env"
import {MAC_MODS, WIN_MODS} from "@/constants/keyboard"

import type {CanonMod, ShortcutAction, ShortcutDefinition} from "@shared/types/shortcuts"

/**
 * Converts a shortcut action to a shortcut key.
 * @example
 * toShortcutKeys("ui:open-search-panel") // ⌘ F
 */
export function toShortcutKeys(action: ShortcutAction): string {
  return formatAccelerator(SHORTCUTS_MAP[action].accelerator)
}

function formatAccelerator(accelerator: ShortcutDefinition["accelerator"]): string {
  const parsed = parseAccelerator(accelerator)
  const tokens = parsed[devicePlatform]
  if (!tokens.length) return ""

  if (devicePlatform === "mac") return tokens.map((t) => MAC_MODS?.[t as CanonMod] ?? t).join(" ")
  return tokens.map((t) => WIN_MODS?.[t as CanonMod] ?? t).join(" ")
}
