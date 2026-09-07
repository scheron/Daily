import type {BoardStatus} from "@daily/protocol"

/** Task counts by status for a day (or an aggregate of days). */
export type DayStatistics = Record<BoardStatus, number>
