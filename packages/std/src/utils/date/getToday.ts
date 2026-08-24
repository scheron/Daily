import {DateTime} from "luxon"

/**
 * Returns today's date in the local timezone as an ISO date (YYYY-MM-DD).
 * @returns {ISODate} Today's local date
 * @example getToday() // "2026-06-30"
 */
export function getToday(): string {
  return DateTime.now().toISODate()!
}
