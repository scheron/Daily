import {DateTime} from "luxon"

import {AgentToolError} from "../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../errors/agent/AgentToolErrorCode"

import type {ISODate, ISODateTime, ISOTime, TaskScheduled, Timezone} from "@daily/protocol"

/** The agent's Mac's own reading of now: the day, the time and the schedule a task created through an agent lands on. */
export type AgentClock = {
  readonly timeZone: Timezone
  today(): ISODate
  time(): ISOTime
  scheduledNow(): TaskScheduled
  dayStart(date: ISODate): ISODateTime
  dayEndExclusive(date: ISODate): ISODateTime
}

/**
 * Builds the clock a tool call dates its work by, from the time zone of the Mac the agent belongs to.
 *
 * @param timeZone An IANA time zone identifier. An unknown one throws `AgentToolError(INVALID_TIME_ZONE)` rather than falling back to UTC, which would put a task on the wrong day.
 * @param now The instant to read, for tests. Defaults to the server's own clock.
 */
export function createAgentClock(timeZone: string, now: () => Date = () => new Date()): AgentClock {
  if (!DateTime.now().setZone(timeZone).isValid) {
    throw new AgentToolError(
      AgentToolErrorCode.INVALID_TIME_ZONE,
      `Unknown time zone "${timeZone}". This server cannot tell which day it is on that Mac.`,
    )
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
