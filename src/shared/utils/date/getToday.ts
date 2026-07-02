import {DateTime} from "luxon"

import type {ISODate} from "../../types/common"

/**
 * Returns today's date in the local timezone as an ISO date (YYYY-MM-DD).
 * @returns {ISODate} Today's local date
 * @example getToday() // "2026-06-30"
 */
export function getToday(): ISODate {
  return DateTime.now().toISODate()!
}
