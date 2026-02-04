import {DateTime} from "luxon"

import type {ISODate, ISODateTime} from "../../types/common"

/**
 * Formats a date to a full date
 * @param date - The date to format
 * @param options - The options to format the date
 * @returns The formatted date
 * @example toFullDate("2021-01-01") // "Jan 1, 2021"
 */
export function toFullDate(date: ISODate | string, options: {short?: boolean} = {}) {
  return DateTime.fromISO(date).toLocaleString({
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: options?.short ? undefined : "short",
  })
}

/**
 * Formats a date to a day
 * @param date - The date to format
 * @returns The formatted date
 * @example toDay("2021-01-01") // 1
 */
export function toDay(date: ISODate) {
  return DateTime.fromISO(date).day
}
/**
 * Formats a date to a day label
 * @param date - The date to format
 * @param options - The options to format the date
 * @returns The formatted date
 * @example toDayLabel("2021-01-01") // "Monday"
 */
export function toDayLabel(date: ISODate, options: {short?: boolean} = {}) {
  return DateTime.fromISO(date).toLocaleString({
    weekday: options?.short ? "short" : "long",
    month: options?.short ? undefined : "long",
    day: options?.short ? undefined : "numeric",
  })
}

/**
 * Formats a date to a month and year
 * @param date - The date to format
 * @returns The formatted date
 * @example toMonthYear("2021-01-01") // "January 2021"
 */
export function toMonthYear(date: ISODate) {
  return DateTime.fromISO(date).toLocaleString({
    month: "long",
    year: "numeric",
  })
}

/**
 * Formats a date to a locale date
 * @param date - The date to format
 * @param locale - The locale to format the date
 * @returns The formatted date
 * @example toLocaleDate("2021-01-01") // "1/1/2021"
 */
export function toLocaleDate(date: Date, locale: string = "en-US") {
  return DateTime.fromJSDate(date).toLocaleString(DateTime.DATE_SHORT, {locale})
}

/**
 * Formats a date range to a locale date range
 * @param range - The date range to format
 * @param locale - The locale to format the date
 * @returns The formatted date range
 * @example toLocaleDateRange([new Date("2021-01-01"), new Date("2021-01-02")]) // "1/1/2021 — 1/2/2021"
 */
export function toLocaleDateRange(range: [Date, Date | null], locale: string = "en-US") {
  if (!range || !range[0]) return ""
  const start = toLocaleDate(range[0], locale)
  if (!range[1]) return start
  const end = toLocaleDate(range[1], locale)
  return `${start} — ${end}`
}

/**
 * Formats a date to a locale date time
 * @param date - The date to format
 * @param locale - The locale to format the date
 * @returns The formatted date time
 * @example toLocaleDateTime("2021-01-01") // "1/1/2021 12:00:00"
 */
export function toLocaleDateTime(date: Date, locale: string = "en-US") {
  const d = date instanceof Date ? date : new Date(date)
  return DateTime.fromJSDate(d).toFormat("dd MMM yyyy HH:mm:ss", {locale})
}

/**
 * Formats a date to a locale time
 * @param date - The date to format
 * @param locale - The locale to format the date
 * @returns The formatted time
 * @example toLocaleTime("2021-01-01") // "12:00:00"
 */
export function toLocaleTime(date: Date | string | number, locale: string = "en-US") {
  const d = date instanceof Date ? date : new Date(date)
  return DateTime.fromJSDate(d).toFormat("HH:mm:ss", {locale})
}

/**
 * Formats seconds into a human-readable duration in days, hours, and minutes.
 * @param {number} seconds - The number of seconds to format.
 * @returns {string} A human-readable duration string.
 * @example formatDuration(30) // "1 min."
 * @example formatDuration(3660) // "1 h. 1 min."
 * @example formatDuration(90000) // "1 d. 1 h."
 */
export function toDurationLabel(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  const resultMinutes = minutes + (remainingSeconds >= 30 ? 1 : 0)

  const parts: string[] = []

  if (days > 0) parts.push(`${days} d.`)
  if (hours > 0) parts.push(`${hours} h.`)
  if (resultMinutes > 0) parts.push(`${resultMinutes} min.`)

  return parts.join(" ") || "<1 min."
}

/**
 * Converts an ISO date time to a timestamp
 *
 * @param value - The value to convert to a timestamp
 * @returns The timestamp
 * @example toTs("2021-01-01") // 1609459200000
 */
export function toTs(value?: ISODateTime): number {
  if (!value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

/**
 * Converts a timestamp to an ISO date time
 * @param value - The value to convert to an ISO date time
 * @returns The ISO date time
 * @example toISODateTime(1609459200000) // "2021-01-01T00:00:00.000Z"
 */
export function toISODateTime(value: number): ISODateTime {
  return new Date(value).toISOString()
}

/**
 * Converts a timestamp to an ISO date time
 * @param value - The value to convert to an ISO date time
 * @returns The ISO date time
 * @example toISODate(1609459200000) // "2021-01-01"
 */
export function toISODate(value: number | Date | string): ISODate {
  if (value instanceof Date) return DateTime.fromJSDate(value).toFormat("yyyy-MM-dd")
  if (typeof value === "number") return DateTime.fromMillis(value).toFormat("yyyy-MM-dd")
  return value
}
