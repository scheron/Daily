import type {ShortcutsMap} from "../constants/shortcuts"

export type ShortcutAction = keyof typeof ShortcutsMap
export type ShortcutChannel = (typeof ShortcutsMap)[ShortcutAction]["channel"]
export type ShortcutPlatform = "mac" | "win"
export type ShortcutDefinition = (typeof ShortcutsMap)[ShortcutAction]

export type ParsedAccelerator = {
  mac: string[]
  win: string[]
}

export type CanonMod = "Cmd" | "Ctrl" | "Alt" | "Shift"
