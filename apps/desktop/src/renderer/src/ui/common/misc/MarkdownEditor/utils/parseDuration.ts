/**
 * Reads a typed duration made of hours and minutes.
 * @param text Typed duration such as `45m`, `2h` or `1h30m`
 * @returns Seconds, or null when the text is not a positive duration
 * @example parseDuration("1h30m") // 5400
 */
export function parseDuration(text: string): number | null {
  const match = text.trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i)
  if (!match || (match[1] === undefined && match[2] === undefined)) return null

  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60
  return seconds > 0 ? seconds : null
}
