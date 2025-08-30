import {DateTime} from "luxon"

import type {ISODate} from "@/types/date"
import type {Day} from "@/types/tasks"

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

/**
 * Formats seconds into a human-readable duration in days, hours, and minutes.
 * @param {number} seconds - The number of seconds to format.
 * @returns {string} A human-readable duration string.
 * @example formatDuration(30) // "1 min."
 * @example formatDuration(3660) // "1 h. 1 min."
 * @example formatDuration(90000) // "1 d. 1 h."
 */
export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  const resultMinutes = minutes + (remainingSeconds >= 30 ? 1 : 0)

  const parts = []

  if (days > 0) parts.push(`${days} d.`)
  if (hours > 0) parts.push(`${hours} h.`)
  if (resultMinutes > 0) parts.push(`${resultMinutes} min.`)

  return parts.join(" ") || "<1 min."
}

/**
 * Formats seconds into a human-readable duration in hours, minutes, and seconds.
 * @param {number} total - The number of seconds to format.
 * @returns {string} A human-readable duration string.
 * @example formatTime(30) // "00:00:30"
 * @example formatTime(3660) // "01:01:00"
 * @example formatTime(90000) // "01:01:00"
 */
export function formatTime(total: number) {
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  return [hours > 0 ? hours : null, minutes, seconds]
    .filter((unit) => unit !== null)
    .map((unit) => unit.toString().padStart(2, "0"))
    .join(":")
}
