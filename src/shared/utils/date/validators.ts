import {DateTime} from "luxon"

import {toTs} from "./formatters"

import type {ISODate, ISODateTime} from "../../types/common"

export function isNewer(a: ISODateTime, b: ISODateTime): boolean {
  return toTs(a) > toTs(b)
}

export function isOlder(a: ISODateTime, b: ISODateTime): boolean {
  return toTs(a) < toTs(b)
}

export function isEqual(a: ISODateTime, b: ISODateTime): boolean {
  return toTs(a) === toTs(b)
}

export function isNewerOrEqual(a: ISODateTime, b: ISODateTime): boolean {
  return isNewer(a, b) || isEqual(a, b)
}

export function isOlderOrEqual(a: ISODateTime, b: ISODateTime): boolean {
  return isOlder(a, b) || isEqual(a, b)
}

export function isToday(date: ISODate) {
  return date === DateTime.now().toISODate()!
}

/**
 * Whether `date` falls within `[start, end]`, inclusive. Relies on `YYYY-MM-DD`
 * sorting lexicographically, so the comparison is chronological without parsing.
 * @example isInRange("2026-06-15", "2026-06-01", "2026-06-30") // true
 */
export function isInRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end
}
