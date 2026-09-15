import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {parseAccelerator} from "@shared/utils/shortcuts/parseAccelerator"

import type {CanonMod, ShortcutAction, ShortcutDefinition} from "@shared/types/shortcuts"

/** @example toShortcutKeys("ui:open-search-panel") // "⌘ F" */
export function toShortcutKeys(action: ShortcutAction): string {
  return formatAccelerator(SHORTCUTS_MAP[action].accelerator)
}

function formatAccelerator(accelerator: ShortcutDefinition["accelerator"]): string {
  const devicePlatform = window.BridgeIPC["platform:is-mac"]() ? "mac" : "win"
  const tokens = parseAccelerator(accelerator)[devicePlatform]
  if (!tokens.length) return ""

  const mods: Record<CanonMod, string> =
    devicePlatform === "mac" ? {Cmd: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧"} : {Cmd: "Win", Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift"}

  return tokens.map((token) => mods[token as CanonMod] ?? token).join(" ")
}
