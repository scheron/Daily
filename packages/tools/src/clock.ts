import {DateTime} from "luxon"

import {ToolError} from "./errors/ToolError"
import {ToolErrorCode} from "./errors/ToolErrorCode"

import type {ToolClock} from "./types"

/**
 * Builds the clock a tool call dates its work by, from an IANA time zone — an agent's Mac, or this
 * one. An unknown zone throws `ToolError(INVALID_TIME_ZONE)` rather than falling back to UTC, which
 * would put a task on the wrong day.
 *
 * @param now The instant to read, for tests. Defaults to the real clock.
 */
export function createClock(timeZone: string, now: () => Date = () => new Date()): ToolClock {
  if (!DateTime.now().setZone(timeZone).isValid) {
    throw new ToolError(ToolErrorCode.INVALID_TIME_ZONE, `Unknown time zone "${timeZone}".`)
  }

  const readNow = () => DateTime.fromJSDate(now()).setZone(timeZone)

  return {
    timeZone,
    today: () => readNow().toISODate()!,
    time: () => readNow().toFormat("HH:mm:ss"),
    scheduledNow: () => {
      const at = readNow()
      return {date: at.toISODate()!, time: at.toFormat("HH:mm:ss"), timezone: timeZone}
    },
    dayStart: (date) => DateTime.fromISO(date, {zone: timeZone}).startOf("day").toUTC().toISO()!,
    dayEndExclusive: (date) => DateTime.fromISO(date, {zone: timeZone}).startOf("day").plus({days: 1}).toUTC().toISO()!,
  }
}
