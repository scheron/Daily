import {parseAccelerator} from "@shared/utils/shortcuts/parseAccelerator"
import {devicePlatform} from "@/constants/env"
import {MAC_MODS, WIN_MODS} from "@/constants/keyboard"

import type {CanonMod, ShortcutDefinition} from "@shared/types/shortcuts"

export function formatAccelerator(accelerator: ShortcutDefinition["accelerator"]): string {
  const parsed = parseAccelerator(accelerator)
  const tokens = parsed[devicePlatform]
  if (!tokens.length) return ""

  if (devicePlatform === "mac") return tokens.map((t) => MAC_MODS?.[t as CanonMod] ?? t).join(" ")
  return tokens.map((t) => WIN_MODS?.[t as CanonMod] ?? t).join(" ")
}
