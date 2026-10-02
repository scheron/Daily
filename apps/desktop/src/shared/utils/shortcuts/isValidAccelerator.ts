import {parseAccelerator} from "./parseAccelerator"

import type {CanonMod} from "@shared/types/shortcuts"

/**
 * An accelerator is valid when its macOS mapping is at least one modifier followed by exactly one non-modifier key.
 * @example isValidAccelerator("Command+Alt+Space") // true
 * @example isValidAccelerator("Command") // false
 */
export function isValidAccelerator(accelerator: string): boolean {
  if (!accelerator) return false

  const {mac} = parseAccelerator(accelerator)
  if (mac.length < 2) return false

  const key = mac.at(-1)
  if (!key || isCanonMod(key)) return false

  return mac.slice(0, -1).every(isCanonMod)
}

function isCanonMod(token: string): token is CanonMod {
  return ["Cmd", "Ctrl", "Alt", "Shift"].includes(token)
}
