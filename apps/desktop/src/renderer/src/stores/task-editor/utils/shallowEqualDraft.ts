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
    sameSchedule(a.scheduled, b.scheduled) &&
    sameTagIds(a.tags, b.tags)
  )
}

function sameSchedule(a: TaskDraft["scheduled"], b: TaskDraft["scheduled"]): boolean {
  if (!a || !b) return a === b
  return a.date === b.date && a.time === b.time && a.timezone === b.timezone
}
