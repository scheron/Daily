/**
 * Formats seconds into a human-readable duration in days, hours, and minutes.
 * @param {number} seconds - The number of seconds to format.
 * @returns {string} A human-readable duration string.
 * @example formatDuration(30) // "1 min."
 * @example formatDuration(3660) // "1 h. 1 min."
 * @example formatDuration(90000) // "1 d. 1 h."
 */
export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  const resultMinutes = minutes + (remainingSeconds >= 30 ? 1 : 0)

  const parts: string[] = []

  if (days > 0) parts.push(`${days} d.`)
  if (hours > 0) parts.push(`${hours} h.`)
  if (resultMinutes > 0) parts.push(`${resultMinutes} min.`)

  return parts.join(" ") || "<1 min."
}
