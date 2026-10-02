import {DateTime} from "luxon"

import type {ISODate} from "@daily/protocol"

/**
 * Reads a typed `dd.mm` date as the next such day on or after `today`, looking years ahead for a 29 Feb.
 * @param today Reference day, as an ISO date
 * @returns The ISO date, or null when the text is not a real calendar day
 * @example parseDayMonth("05.10", "2026-10-02") // "2026-10-05"
 * @example parseDayMonth("1.3", "2026-10-02") // "2027-03-01"
 * @example parseDayMonth("29.02", "2026-10-02") // "2028-02-29"
 */
export function parseDayMonth(text: string, today: ISODate): ISODate | null {
  const match = text.trim().match(/^(\d{1,2})\.(\d{1,2})$/)
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = DateTime.fromISO(today).year

  for (let offset = 0; offset <= 8; offset++) {
    const candidate = DateTime.fromObject({year: year + offset, month, day})
    if (candidate.isValid && candidate.toISODate()! >= today) return candidate.toISODate()
  }

  return null
}
