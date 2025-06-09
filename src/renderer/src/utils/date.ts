import {DateTime} from "luxon"

import type {ISODate} from "@/types/date"

export function toFullDate(date: ISODate | string, options: {short?: boolean} = {}) {
  return DateTime.fromISO(date).toLocaleString({
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: options?.short ? undefined : "short",
  })
}

export function toDay(date: ISODate) {
  return DateTime.fromISO(date).day
}

export function toDayLabel(date: ISODate, options: {short?: boolean} = {}) {
  return DateTime.fromISO(date).toLocaleString({
    weekday: options?.short ? "short" : "long",
    month: options?.short ? undefined : "long",
    day: options?.short ? undefined : "numeric",
  })
}

export function toMonthYear(date: ISODate) {
  return DateTime.fromISO(date).toLocaleString({
    month: "long",
    year: "numeric",
  })
}

export function getWeekStartDate(fromDate: ISODate) {
  const date = DateTime.fromISO(fromDate)
  const day = date.weekday
  const adjustedDay = day === 0 ? 7 : day
  const diff = date.day - adjustedDay + 1
  return date.set({day: diff, hour: 0, minute: 0, second: 0, millisecond: 0}).toISODate()!
}

export function isToday(date: ISODate) {
  return date === DateTime.now().toISODate()!
}

export function toLocaleDate(date: Date, locale: string) {
  return DateTime.fromJSDate(date).toLocaleString(DateTime.DATE_SHORT, {locale})
}

export function toLocaleDateRange(range: [Date, Date | null], locale: string) {
  if (!range || !range[0]) return ""
  const start = toLocaleDate(range[0], locale)
  if (!range[1]) return start
  const end = toLocaleDate(range[1], locale)
  return `${start} — ${end}`
}
