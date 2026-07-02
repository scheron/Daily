import {parseAccelerator} from "./parseAccelerator"

/**
 * Compare two accelerators for semantic equality on macOS.
 * `"Command+A"` and `"Cmd+A"` match; `"Shift+Cmd+A"` and `"Cmd+Shift+A"` match
 * (modifier ordering is canonicalised by `parseAccelerator`).
 */
export function acceleratorsMatch(a: string, b: string): boolean {
  const left = parseAccelerator(a).mac
  const right = parseAccelerator(b).mac

  if (left.length !== right.length) return false
  return left.every((token, i) => token === right[i])
}
