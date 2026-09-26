import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {parseAccelerator} from "@shared/utils/shortcuts/parseAccelerator"

import type {ShortcutAction} from "@shared/types/shortcuts"

/** @example toShortcutKeys("ui:open-search-panel") // "⌘ F" */
export function toShortcutKeys(action: ShortcutAction): string {
  return toShortcutKeyCaps(action).join(" ")
}

/** @example toShortcutKeyCaps("ui:open-assistant-panel") // ["⌘", "⇧", "A"] */
export function toShortcutKeyCaps(action: ShortcutAction): string[] {
  const devicePlatform = window.BridgeIPC["platform:is-mac"]() ? "mac" : "win"
  const symbols: Record<string, string> =
    devicePlatform === "mac"
      ? {Cmd: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Enter: "↵", Escape: "Esc"}
      : {Cmd: "Win", Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Escape: "Esc"}

  return parseAccelerator(SHORTCUTS_MAP[action].accelerator)[devicePlatform].map((token) => symbols[token] ?? token)
}
