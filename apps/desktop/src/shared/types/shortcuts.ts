import type {SHORTCUTS_MAP} from "../constants/shortcuts"

export type ShortcutAction = keyof typeof SHORTCUTS_MAP
export type ShortcutPlatform = "mac" | "win"
export type ShortcutDefinition = (typeof SHORTCUTS_MAP)[ShortcutAction]
export type ShortcutChannel = Extract<ShortcutDefinition, {channel: string}>["channel"]

export type ParsedAccelerator = {
  mac: string[]
  win: string[]
}

export type CanonMod = "Cmd" | "Ctrl" | "Alt" | "Shift"
