import {DateTime} from "luxon"

import type {ISODate} from "@shared/types/common"
import type {Day} from "@shared/types/storage"

/** Week-row pitch in px: h-9 cell (36) + gap-1 (4); drives all viewport math */
export const ROW_HEIGHT = 40
/** Fixed epoch Monday; week indices never move relative to it */
export const LATTICE_EPOCH: ISODate = "2001-01-01"

export type DayDotStatus = "active" | "done"

export type WeekRow = {
  index: number
  /** 7 ISO dates, Monday-first */
  days: ISODate[]
}

export function weekIndexForDate(date: ISODate): number {
  return Math.floor(daysFromEpoch(date) / 7)
}

export function buildWeek(index: number): WeekRow {
  const start = EPOCH_DATE.plus({days: index * 7})
  const days: ISODate[] = []
  for (let col = 0; col < 7; col++) {
    days.push(start.plus({days: col}).toISODate()!)
  }
  return {index, days}
}

export function buildWeekRange(from: ISODate, to: ISODate): WeekRow[] {
  const weeks: WeekRow[] = []
  for (let i = weekIndexForDate(from); i <= weekIndexForDate(to); i++) {
    weeks.push(buildWeek(i))
  }
  return weeks
}

export function getDayDotStatus(day: Day | null | undefined): DayDotStatus | null {
  if (!day || day.tasks.length === 0) return null
  return day.countActive > 0 ? "active" : "done"
}

/** Date at the vertical center of the viewport (Thursday of the centered row — majority-of-week month rule) */
export function dateAtViewportCenter(params: {scrollTop: number; clientHeight: number; firstWeekIndex: number}): ISODate {
  const centerY = params.scrollTop + params.clientHeight / 2
  const rowOffset = Math.floor(centerY / ROW_HEIGHT)
  const dayOffset = (params.firstWeekIndex + rowOffset) * 7 + 3

  return EPOCH_DATE.plus({days: dayOffset}).toISODate()!
}

/** scrollTop that vertically centers the week row containing the date */
export function scrollTopForDate(params: {date: ISODate; firstWeekIndex: number; clientHeight: number}): number {
  const rowOffset = weekIndexForDate(params.date) - params.firstWeekIndex
  return Math.max(0, rowOffset * ROW_HEIGHT - (params.clientHeight - ROW_HEIGHT) / 2)
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10))
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7)
}

const EPOCH_DATE = DateTime.fromISO(LATTICE_EPOCH)

function daysFromEpoch(date: ISODate): number {
  return Math.round(DateTime.fromISO(date).diff(EPOCH_DATE, "days").days)
}
