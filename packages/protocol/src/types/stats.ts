import type {ISODate} from "./common"
import type {Branch} from "./storage"

export type StatsPeriod = "week" | "month"

export type StatTag = {
  id: string
  name: string
  color: string
  count: number
}

export type StatsAggregate = {
  /** Task status counts for the period (by scheduled date); the ring fills on `resolvedPct`. */
  resolution: {
    active: number
    done: number
    discarded: number
    total: number
    /** `(done + discarded) / total`, 0–100, rounded. */
    resolvedPct: number
  }
  /** Tasks scheduled in the period that are currently done (matches the ring's done count). */
  completedTotal: number
  /** Done tasks per tag, highest first (a multi-tag task counts in each tag). */
  tags: StatTag[]
  /** Done tasks with no tag — the neutral donut segment. */
  untaggedCount: number
  /** Done tasks per weekday of completion, Monday-first (length 7). */
  weekday: number[]
  /** Done tasks per hour of completion (length 24). */
  hours: number[]
  /** Index (0 = Monday) of the busiest weekday, or null when nothing was completed. */
  peakWeekday: number | null
  /** Busiest hour of day (0–23), or null when nothing was completed. */
  peakHour: number | null
  /** Most frequent tag among completions, or null. */
  topTag: {id: string; name: string; color: string} | null
}

export type StatsQuery = {
  period: StatsPeriod
  anchor: ISODate
  branchId?: Branch["id"]
}
