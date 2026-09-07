import {DateTime} from "luxon"

import {toTs} from "./formatters"

export function isNewer(a: string, b: string): boolean {
  return toTs(a) > toTs(b)
}

export function isOlder(a: string, b: string): boolean {
  return toTs(a) < toTs(b)
}

export function isEqual(a: string, b: string): boolean {
  return toTs(a) === toTs(b)
}

export function isNewerOrEqual(a: string, b: string): boolean {
  return isNewer(a, b) || isEqual(a, b)
}

export function isOlderOrEqual(a: string, b: string): boolean {
  return isOlder(a, b) || isEqual(a, b)
}

export function isToday(date: string) {
  return date === DateTime.now().toISODate()!
}

/**
 * Whether `date` falls within `[start, end]`, inclusive. Relies on `YYYY-MM-DD`
 * sorting lexicographically, so the comparison is chronological without parsing.
 * @example isInRange("2026-06-15", "2026-06-01", "2026-06-30") // true
 */
export function isInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}
