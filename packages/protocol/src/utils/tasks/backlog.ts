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
