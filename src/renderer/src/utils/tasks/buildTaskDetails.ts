import {toDurationLabel, toFullDate} from "@shared/utils/date/formatters"

import type {Tag, Task} from "@shared/types/storage"

export function buildTaskDetails(task: Task, resolvedTags: Tag[]): string {
  const tags = resolvedTags.length ? resolvedTags : task.tags
  const tagsLines = tags.length ? tags.map((tag) => `  - #${tag.name}`) : ["  - (none)"]

  return [
    "---",
    `ID: ${task.id}`,
    `Status: ${task.status}`,
    `Scheduled: ${toFullDate(task.scheduled.date)}`,
    `Estimated time: ${task.estimatedTime > 0 ? toDurationLabel(task.estimatedTime) : "-"}`,
    `Spent time: ${task.spentTime > 0 ? toDurationLabel(task.spentTime) : "-"}`,
    "Tags:",
    ...tagsLines,
    "---",
    "",
    task.content,
  ].join("\n")
}
