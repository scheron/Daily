import {DateTime} from "luxon"

import type {ISODate} from "../../types/common"

/**
 * Shifts an ISO date by a number of months.
 * @param {ISODate} date - The base date
 * @param {number} months - Months to add (negative to subtract)
 * @returns {ISODate} The shifted date
 * @example
 * addMonths("2026-01-15", 3) // "2026-04-15"
 * addMonths("2026-01-15", -1) // "2025-12-15"
 */
export function addMonths(date: ISODate, months: number): ISODate {
  return DateTime.fromISO(date).plus({months}).toISODate()!
}
