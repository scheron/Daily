import {sameTagIds} from "./sameTagIds"

import type {TaskDraft} from "@/types/tasks"

/**
 * Whether two drafts are equal across every editable field (used to compute dirtiness).
 * @example shallowEqualDraft(draft, base) // false when any field changed
 */
export function shallowEqualDraft(a: TaskDraft, b: TaskDraft): boolean {
  return (
    a.content === b.content &&
    a.estimatedTime === b.estimatedTime &&
    a.spentTime === b.spentTime &&
    a.status === b.status &&
    a.branchId === b.branchId &&
    a.scheduled.date === b.scheduled.date &&
    a.scheduled.time === b.scheduled.time &&
    a.scheduled.timezone === b.scheduled.timezone &&
    sameTagIds(a.tags, b.tags)
  )
}
