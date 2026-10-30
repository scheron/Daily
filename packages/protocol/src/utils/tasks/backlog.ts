import {getTime, getTimezone} from "@daily/std"

import type {ISODate} from "../../types/common"
import type {TaskScheduled, TaskStatus} from "../../types/storage"

/** Backlog clears its day; readiness preserves its optional day; every other status requires one. */
export function schedulingForStatus(status: TaskStatus, current: TaskScheduled | null, activeDate: ISODate): TaskScheduled | null {
  if (status === "backlog") return null
  if (status === "ready_for_agent") return current
  if (current) return current

  return {date: activeDate, time: getTime(), timezone: getTimezone()}
}

/** Setting or clearing a Ready for Agent task's day keeps readiness. Giving Backlog a day plans work. */
export function statusForScheduling(currentStatus: TaskStatus, nextScheduled: TaskScheduled | null): TaskStatus {
  if (currentStatus === "ready_for_agent") return currentStatus
  if (!nextScheduled) return "backlog"
  if (currentStatus === "backlog") return "todo"

  return currentStatus
}

/**
 * Fills the parts of a schedule a caller left out, including the first day assigned to Ready work.
 * A stored schedule always has a date, time and timezone.
 */
export function completeScheduling(partial: Partial<TaskScheduled> & {date: ISODate}): TaskScheduled {
  return {
    date: partial.date,
    time: partial.time ?? getTime(),
    timezone: partial.timezone ?? getTimezone(),
  }
}
