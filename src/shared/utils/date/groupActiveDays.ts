import {DateTime} from "luxon"

import type {ISODate} from "../../types/common"
import type {Day} from "../../types/storage"

export type GroupedActiveDay = {
  date: ISODate
  count: number
}

export type ActiveDaysGroup = {
  label: "today" | "yesterday" | "this week" | "last week" | "last month" | "older"
  count: number
  items: GroupedActiveDay[]
}

/**
 * Groups active days into categories: today, yesterday, this week, last week, last month, and older
 * @param days - Array of days to group
 * @returns Array of grouped active days
 * @example
 * const groups = groupActiveDays(days)
 * // Returns: [
 * //   {label: "today", count: 1, items: [{date: "2024-01-15", count: 3}]},
 * //   {label: "yesterday", count: 1, items: [{date: "2024-01-14", count: 2}]},
 * //   ...
 * // ]
 */
export function groupActiveDays(days: Day[]): ActiveDaysGroup[] {
  const now = DateTime.now()
  const today = now.toISODate()!
  const yesterday = now.minus({days: 1}).toISODate()!
  const startOfThisWeek = now.startOf("week")
  const startOfLastWeek = startOfThisWeek.minus({weeks: 1})
  const endOfLastWeek = startOfThisWeek.minus({days: 1})

  const startOfThisMonth = now.startOf("month")
  const startOfLastMonth = startOfThisMonth.minus({months: 1})
  const endOfLastMonth = startOfThisMonth.minus({days: 1})

  const todayItems: GroupedActiveDay[] = []
  const yesterdayItems: GroupedActiveDay[] = []
  const thisWeek: GroupedActiveDay[] = []
  const lastWeek: GroupedActiveDay[] = []
  const lastMonth: GroupedActiveDay[] = []
  const older: GroupedActiveDay[] = []

  for (const day of days) {
    if (!day.countActive) continue
    const dayDate = DateTime.fromISO(day.date)
    const dayDateStr = day.date

    const isToday = dayDateStr === today
    const isYesterday = dayDateStr === yesterday
    const isInThisWeek = dayDate >= startOfThisWeek && dayDate <= now && !isToday && !isYesterday
    const isInLastWeek = dayDate >= startOfLastWeek && dayDate <= endOfLastWeek
    const isInLastMonth = dayDate >= startOfLastMonth && dayDate <= endOfLastMonth
    const isOlder = dayDate < startOfLastMonth

    if (isToday) todayItems.push({date: day.date, count: day.countActive})
    else if (isYesterday) yesterdayItems.push({date: day.date, count: day.countActive})
    else if (isInThisWeek) thisWeek.push({date: day.date, count: day.countActive})
    else if (isInLastWeek) lastWeek.push({date: day.date, count: day.countActive})
    else if (isInLastMonth) lastMonth.push({date: day.date, count: day.countActive})
    else if (isOlder) older.push({date: day.date, count: day.countActive})
  }

  const sortDesc = (a: GroupedActiveDay, b: GroupedActiveDay) => b.date.localeCompare(a.date)

  return [
    {label: "today", count: todayItems.length, items: todayItems.sort(sortDesc)},
    {label: "yesterday", count: yesterdayItems.length, items: yesterdayItems.sort(sortDesc)},
    {label: "this week", count: thisWeek.length, items: thisWeek.sort(sortDesc)},
    {label: "last week", count: lastWeek.length, items: lastWeek.sort(sortDesc)},
    {label: "last month", count: lastMonth.length, items: lastMonth.sort(sortDesc)},
    {label: "older", count: older.length, items: older.sort(sortDesc)},
  ]
}
