import {DateTime} from "luxon"

import type {ISODate} from "@shared/types/common"
import type {Day} from "@shared/types/storage"

export function getWeekDays(days: Day[], currentDate: ISODate) {
  const date = DateTime.fromISO(currentDate)
  const day = date.weekday
  const adjustedDay = day === 0 ? 7 : day
  const diff = date.day - adjustedDay + 1

  const weekStart = DateTime.fromISO(currentDate).set({day: diff})
  const week = []

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

/**
 * Gets the previous week's date from the given date
 * @param {ISODate} currentDate - The current date
 * @returns {ISODate} The date from the previous week
 */
export function getPreviousWeek(currentDate: ISODate): ISODate {
  return DateTime.fromISO(currentDate).minus({weeks: 1}).toISODate()!
}

/**
 * Gets the next week's date from the given date
 * @param {ISODate} currentDate - The current date
 * @returns {ISODate} The date from the next week
 */
export function getNextWeek(currentDate: ISODate): ISODate {
  return DateTime.fromISO(currentDate).minus({weeks: -1}).toISODate()!
}
