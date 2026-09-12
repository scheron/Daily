import {sameTagIds} from "./sameTagIds"

import type {TaskDraft} from "@/types/tasks"
import type {Tag, Task, TaskStatus} from "@daily/protocol"

type RestPatch = {
  content: string
  tags: Tag[]
  estimatedTime: number
  spentTime: number
  status: TaskStatus
  milestoneId: Task["milestoneId"]
}
/**
 * Builds the minimal patch of changed fields between a draft and its base, excluding
 * `scheduled.date` and `branchId` (those are committed via dedicated move operations).
 * A status leaving the backlog with no date picked is excluded too — that resolves
 * through `moveTaskByOrder`, which takes the board's day, not a plain status write.
 * @example buildRestPatch(next, base) // {content: "..."} — only what differs
 */
export function buildRestPatch(next: TaskDraft, base: TaskDraft) {
  const out: Partial<RestPatch> = {}

  const resolvedWithoutDate = next.status !== "backlog" && !next.scheduled

  if (next.content !== base.content) out.content = next.content
  if (!sameTagIds(next.tags, base.tags)) out.tags = next.tags
  if (next.estimatedTime !== base.estimatedTime) out.estimatedTime = next.estimatedTime
  if (next.spentTime !== base.spentTime) out.spentTime = next.spentTime
  if (next.status !== base.status && !resolvedWithoutDate) out.status = next.status
  if (next.milestoneId !== base.milestoneId) out.milestoneId = next.milestoneId
  return out
}
