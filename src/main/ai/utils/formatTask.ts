import {toDurationLabel} from "@shared/utils/date/formatters"

import type {Task} from "@shared/types/storage"

/**
 * Render a task as a single-line label for AI tool responses.
 * Status emoji + scheduled time + content + tags + estimated/spent + attachment
 * count + id. `compact` keeps content to the first line and 100 chars.
 */
export function formatTask(task: Task, compact = true): string {
  const statusEmoji = task.status === "done" ? "✅" : task.status === "discarded" ? "❌" : "⬜"
  const time = task.scheduled.time || "no time"
  const tags = task.tags.length > 0 ? ` [${task.tags.map((t) => t.name).join(", ")}]` : ""
  const content = compact ? task.content.split("\n")[0].slice(0, 100) : task.content
  const est = task.estimatedTime > 0 ? ` (est: ${toDurationLabel(task.estimatedTime)})` : ""
  const spent = task.spentTime > 0 ? ` (spent: ${toDurationLabel(task.spentTime)})` : ""
  const attachments = task.attachments.length > 0 ? ` 📎${task.attachments.length}` : ""
  return `${statusEmoji} [${time}] ${content}${tags}${est}${spent}${attachments} (ID: ${task.id})`
}
