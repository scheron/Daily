import {getTime, getTimezone} from "@daily/std"

import type {ISODate} from "../../types/common"
import type {TaskScheduled, TaskStatus} from "../../types/storage"

/**
 * The backlog invariant, in one place: a task is in the backlog exactly when it has no schedule.
 * Returns the scheduling a task must carry for `status`.
 *  - `backlog`      → null
 *  - anything else  → `current` when it is set, otherwise a fresh schedule on `activeDate`
 *                     with `getTime()` and `getTimezone()` from `@daily/std`
 */
export function schedulingForStatus(status: TaskStatus, current: TaskScheduled | null, activeDate: ISODate): TaskScheduled | null {
  if (status === "backlog") return null
  if (current) return current

  return {date: activeDate, time: getTime(), timezone: getTimezone()}
}

/**
 * The backlog invariant read in the other direction: the status a task must carry once a
 * schedule is written to it. A task given a day while in the backlog becomes `active`; any
 * other status is preserved. No schedule always means `backlog`.
 */
export function statusForScheduling(currentStatus: TaskStatus, nextScheduled: TaskScheduled | null): TaskStatus {
  if (!nextScheduled) return "backlog"
  if (currentStatus === "backlog") return "active"

  return currentStatus
}

/**
 * Fills the parts of a schedule a caller left out. A task leaving the backlog is given a day
 * and almost never a time, and there is no such thing as a half-written schedule in the row.
 */
export function completeScheduling(partial: Partial<TaskScheduled> & {date: ISODate}): TaskScheduled {
  return {
    date: partial.date,
    time: partial.time ?? getTime(),
    timezone: partial.timezone ?? getTimezone(),
  }
}
