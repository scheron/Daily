import type {TaskStatus} from "@shared/types/storage"

/** Task counts by status for a day (or an aggregate of days). */
export type DayStatistics = Record<TaskStatus, number>
