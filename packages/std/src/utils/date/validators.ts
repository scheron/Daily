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
