const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"
const BASE = DIGITS.length

/**
 * A sort key strictly between two others, comparing as plain text. Keys read as base-36 fractions, so
 * a key can always be squeezed between two neighbours without touching either.
 *
 * @param before The key it must follow, or `null` for the start.
 * @param after The key it must precede, or `null` for the end. Ignored when it does not sort after `before`.
 * @example keyBetween(null, null) // "i"
 * @example keyBetween("i", null) // "r"
 * @example keyBetween("i", "r") // "m"
 */
export function keyBetween(before: string | null, after: string | null): string {
  const lower = before ?? ""
  let upper = after !== null && after > lower ? after : null
  let key = ""

  for (let i = 0; ; i++) {
    const low = i < lower.length ? DIGITS.indexOf(lower[i]) : 0
    const high = upper !== null && i < upper.length ? DIGITS.indexOf(upper[i]) : BASE
    const mid = Math.floor((low + high) / 2)

    if (mid > low) return key + DIGITS[mid]

    key += DIGITS[low]
    if (low !== high) upper = null
  }
}
