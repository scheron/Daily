import type {CanonMod, ParsedAccelerator, ShortcutDefinition, ShortcutPlatform} from "../../types/shortcuts"

const MOD_RANK: Record<ShortcutPlatform, Record<CanonMod, number>> = {
  mac: {Cmd: 0, Ctrl: 1, Alt: 2, Shift: 3},
  win: {Ctrl: 0, Cmd: 1, Alt: 2, Shift: 3},
}

export function parseAccelerator(accelerator: ShortcutDefinition["accelerator"]): ParsedAccelerator {
  const parts = accelerator
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean)

  const macMods: CanonMod[] = []
  const winMods: CanonMod[] = []

  let key: string | null = null

  for (const raw of parts) {
    const t = normalizeToken(raw)
    const mapped = mapModifier(t)

    if (mapped) {
      if (mapped.mac) addUnique(macMods, mapped.mac)
      if (mapped.win) addUnique(winMods, mapped.win)
    } else {
      // Key is usually one
      key = raw.trim()
    }
  }

  const mac = [...sortMods("mac", macMods), ...(key ? [key] : [])]
  const win = [...sortMods("win", winMods), ...(key ? [key] : [])]

  return {mac, win}
}

function normalizeToken(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "")
}

function addUnique<T>(arr: T[], v: T) {
  if (!arr.includes(v)) arr.push(v)
}

function mapModifier(tokenNorm: string): {mac?: CanonMod; win?: CanonMod} | null {
  switch (tokenNorm) {
    case "cmd":
    case "command":
      return {mac: "Cmd"}
    case "ctrl":
    case "control":
      return {win: "Ctrl"}
    case "cmdorctrl":
      return {mac: "Cmd", win: "Ctrl"}
    case "alt":
      return {mac: "Alt", win: "Alt"}
    case "option":
      return {mac: "Alt"}
    case "shift":
      return {mac: "Shift", win: "Shift"}
    default:
      return null
  }
}

function sortMods(platform: ShortcutPlatform, mods: CanonMod[]): CanonMod[] {
  const rank = MOD_RANK[platform]
  return mods.toSorted((a, b) => rank[a] - rank[b])
}
