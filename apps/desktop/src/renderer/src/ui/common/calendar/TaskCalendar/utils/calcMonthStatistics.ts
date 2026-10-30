import type {Day, TaskStatus} from "@daily/protocol"

type DayStatistics = Record<TaskStatus, number>

/** Keyed by `YYYY-MM`; days without tasks are skipped. */
export function calcMonthStatistics(days: Day[]): Map<string, DayStatistics> {
  const byMonth = new Map<string, DayStatistics>()

  for (const day of days) {
    if (day.tasks.length === 0) continue

    const key = day.date.slice(0, 7)
    const entry = byMonth.get(key) ?? {backlog: 0, todo: 0, ready_for_agent: 0, in_progress: 0, ready_to_merge: 0, cancelled: 0, done: 0}
    for (const task of day.tasks) entry[task.status] += 1
    byMonth.set(key, entry)
  }

  return byMonth
}
