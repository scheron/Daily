import {sameTagIds} from "./sameTagIds"

import type {TaskDraft} from "@/types/tasks"
import type {Tag, TaskStatus} from "@shared/types/storage"

type RestPatch = {
  content: string
  tags: Tag[]
  estimatedTime: number
  spentTime: number
  status: TaskStatus
}
/**
 * Builds the minimal patch of changed fields between a draft and its base, excluding
 * `scheduled.date` and `branchId` (those are committed via dedicated move operations).
 * @example buildRestPatch(next, base) // {content: "..."} — only what differs
 */
export function buildRestPatch(next: TaskDraft, base: TaskDraft) {
  const out: Partial<RestPatch> = {}

  if (next.content !== base.content) out.content = next.content
  if (!sameTagIds(next.tags, base.tags)) out.tags = next.tags
  if (next.estimatedTime !== base.estimatedTime) out.estimatedTime = next.estimatedTime
  if (next.spentTime !== base.spentTime) out.spentTime = next.spentTime
  if (next.status !== base.status) out.status = next.status
  return out
}
