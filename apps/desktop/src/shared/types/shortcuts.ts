import type {SHORTCUTS_MAP} from "@shared/constants/shortcuts"

export type ShortcutAction = keyof typeof SHORTCUTS_MAP
export type ShortcutPlatform = "mac" | "win"

export type ParsedAccelerator = {
  mac: string[]
  win: string[]
}

export type CanonMod = "Cmd" | "Ctrl" | "Alt" | "Shift"
