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
