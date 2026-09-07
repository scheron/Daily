import type {CanonMod} from "@shared/types/shortcuts"

export const MAC_MODS: Record<CanonMod, string> = {
  Cmd: "⌘",
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
}

export const WIN_MODS: Record<CanonMod, string> = {
  Cmd: "Win",
  Ctrl: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
} as const
