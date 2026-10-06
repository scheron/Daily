/**
 * Formats seconds into a compact duration with single-letter units, rounding to the nearest minute.
 * @returns The compact label, or an empty string when there is no duration.
 * @example toShortDurationLabel(2700) // "45m"
 * @example toShortDurationLabel(4800) // "1h 20m"
 * @example toShortDurationLabel(14400) // "4h"
 * @example toShortDurationLabel(0) // ""
 */
export function toShortDurationLabel(seconds: number): string {
  if (seconds <= 0) return ""

  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean).join(" ")
}
