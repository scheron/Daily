import {DateTime} from "luxon"

import type {ISODate} from "../../types/common"
import type {Day} from "../../types/storage"

export function getWeekDays(days: Day[], currentDate: ISODate) {
  const date = DateTime.fromISO(currentDate)
  const day = date.weekday
  const adjustedDay = day === 0 ? 7 : day
  const diff = date.day - adjustedDay + 1

  const weekStart = DateTime.fromISO(currentDate).set({day: diff})
  const week: {date: ISODate; isCurrentMonth: boolean; day: Day | null}[] = []

  for (let i = 0; i < 7; i++) {
    const dayOfWeek = weekStart.set({day: weekStart.day + i})
    const day = days.find((day) => day.date === dayOfWeek.toISODate())

    week.push({
      date: dayOfWeek.toISODate()!,
      isCurrentMonth: dayOfWeek.month === date.month,
      day: day ?? null,
    })
  }

  return week
}
