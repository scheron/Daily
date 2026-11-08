import {DateTime} from "luxon"

import type {ISODate} from "@daily/protocol"

type UpcomingDay = {date: ISODate; label: string}

/**
 * Lists the days after `today`, each named by its weekday.
 * @param from First offset from today, 1 being tomorrow
 * @example getUpcomingDays("2026-10-02", 2, 1) // [{date: "2026-10-04", label: "Sunday"}]
 */
export function getUpcomingDays(today: ISODate, from: number, count: number): UpcomingDay[] {
  const base = DateTime.fromISO(today)
  return Array.from({length: count}, (_, index) => {
    const day = base.plus({days: from + index})
    return {date: day.toISODate()!, label: day.setLocale("en").toFormat("cccc")}
  })
}
