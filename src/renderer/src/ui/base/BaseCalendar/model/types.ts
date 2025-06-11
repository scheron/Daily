import type {DateTime} from "luxon"

import type {ISODate} from "@/types/date"

export type CalendarDay = {
  date: DateTime
  isCurrentMonth: boolean
  isoDate: ISODate
  dayInfo: {
    countActiveTasks: number
    countCompletedTasks: number
    countDiscardedTasks: number
    countTotalTasks: number
  }
}

export type DateRange = {
  start: ISODate | null
  end: ISODate | null
}

export type CalendarMode = "single" | "range"

export type CalendarSize = "sm" | "md" | "lg"

export type CalendarPreset = {
  label: string
  getValue: () => DateRange
}
