import {DateTime} from "luxon"

import type {ISODate} from "@shared/types/common"
import type {Day} from "@shared/types/storage"

export type DayDotStatus = "active" | "done"

export type MonthSection = {
  /** "YYYY-MM" */
  key: string
  /** ISO date of the 1st */
  firstDay: ISODate
  /** Empty leading cells before the 1st in a Monday-first grid */
  leadingBlanks: number
  /** All days of the month in order */
  days: ISODate[]
}

export type MonthCounts = {
  active: number
  discarded: number
  done: number
}

export function buildMonthSections(from: ISODate, to: ISODate): MonthSection[] {
  const sections: MonthSection[] = []
  let cursor = DateTime.fromISO(from).startOf("month")
  const end = DateTime.fromISO(to).startOf("month")

  while (cursor <= end) {
    const days: ISODate[] = []
    for (let day = 1; day <= cursor.daysInMonth!; day++) {
      days.push(cursor.set({day}).toISODate()!)
    }

    sections.push({
      key: cursor.toFormat("yyyy-MM"),
      firstDay: cursor.toISODate()!,
      leadingBlanks: cursor.weekday - 1,
      days,
    })

    cursor = cursor.plus({months: 1})
  }

  return sections
}

export function buildMonthCounts(days: Day[]): Map<string, MonthCounts> {
  const counts = new Map<string, MonthCounts>()

  for (const day of days) {
    if (day.tasks.length === 0) continue

    const key = monthKey(day.date)
    const entry = counts.get(key) ?? {active: 0, discarded: 0, done: 0}
    entry.active += day.countActive
    entry.done += day.countDone
    entry.discarded += day.tasks.length - day.countActive - day.countDone
    counts.set(key, entry)
  }

  return counts
}

export function getDayDotStatus(day: Day | null | undefined): DayDotStatus | null {
  if (!day || day.tasks.length === 0) return null
  return day.countActive > 0 ? "active" : "done"
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10))
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7)
}
