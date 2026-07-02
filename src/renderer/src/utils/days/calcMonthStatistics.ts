import type {DayStatistics} from "@/types/days"
import type {Day} from "@shared/types/storage"

/**
 * Aggregates task statistics per calendar month, keyed by `YYYY-MM`. Empty days are skipped.
 * @example calcMonthStatistics(days).get("2026-06") // {active: 12, discarded: 3, done: 40}
 */
export function calcMonthStatistics(days: Day[]): Map<string, DayStatistics> {
  const byMonth = new Map<string, DayStatistics>()

  for (const day of days) {
    if (day.tasks.length === 0) continue

    const key = day.date.slice(0, 7)
    const entry = byMonth.get(key) ?? {active: 0, discarded: 0, done: 0}
    entry.active += day.countActive
    entry.done += day.countDone
    entry.discarded += day.tasks.length - day.countActive - day.countDone
    byMonth.set(key, entry)
  }

  return byMonth
}
