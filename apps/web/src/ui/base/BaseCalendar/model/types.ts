import type {DateTime} from "luxon"

import type {ISODate} from "@daily/types/date"

export type CalendarDay = {
  date: DateTime
  isCurrentMonth: boolean
  isoDate: ISODate
  dayInfo: {
    countCompletedTasks: number
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
