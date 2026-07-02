import type {DayStatistics} from "@/types/days"
import type {Day} from "@shared/types/storage"

/**
 * Per-day task counts. `discarded` is whatever is left after active and done.
 * @example getDayStats(day) // {active: 3, discarded: 1, done: 5}
 */
export function getDayStats(day: Day | null | undefined): DayStatistics {
  if (!day) return {active: 0, discarded: 0, done: 0}

  const active = day.countActive
  const done = day.countDone
  const discarded = day.tasks.length - active - done

  return {active, discarded, done}
}
