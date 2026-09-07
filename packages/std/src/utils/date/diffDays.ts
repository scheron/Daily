import {DateTime} from "luxon"

/**
 * Returns the number of days between two ISO dates (a minus b).
 * @param {ISODate} a - The later date
 * @param {ISODate} b - The earlier date
 * @returns {number} Day difference; positive when a is after b
 * @example
 * diffDays("2026-01-10", "2026-01-01") // 9
 */
export function diffDays(a: string, b: string): number {
  return DateTime.fromISO(a).diff(DateTime.fromISO(b), "days").days
}
