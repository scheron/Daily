import {extractFileIds} from "@daily/core/utils/files/extractFileIds"
import {toDurationLabel} from "@daily/std"

import {formatTask} from "@main/ai/utils/formatters"

import type {TaskComment} from "@daily/protocol"
import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const getTask: RegisteredTool = {
  name: "get_task",
  description:
    "Get detailed information about a single task by its ID: its fields, relations, attachments and its comments with their IDs. Use when you need full task details or to verify a task exists before modifying it.",
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The unique task ID (alphanumeric string like 'kWGw48U_VtUiyIIp_wkEV'). Get IDs from list_tasks or search_tasks.",
      },
    },
    required: ["task_id"],
  },
  isWrite: false,
  isDestructive: false,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const task = await ctx.storage.getTask(taskId)
    if (!task) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    const lines = [`Task details:\n${formatTask(task, false)}`, `Date: ${task.scheduled?.date ?? "no date"}`]

    if (task.estimatedTime > 0 || task.spentTime > 0) {
      const est = toDurationLabel(task.estimatedTime, "none")
      const spent = toDurationLabel(task.spentTime, "none")
      let timeLine = `Time — estimated: ${est}, spent: ${spent}`
      if (task.estimatedTime > 0 && task.spentTime > 0) {
        const pct = Math.round((task.spentTime / task.estimatedTime) * 100)
        timeLine += ` (${pct}%)`
      }
      lines.push(timeLine)
    }

    const attachmentIds = extractFileIds(task.content)
    if (attachmentIds.length > 0) {
      lines.push(`Attachments: ${attachmentIds.length} file(s) — use get_task_attachments for details`)
    }

    const related = await ctx.storage.getTaskRelations(task.id)
    if (related.blockedBy.length > 0) {
      lines.push(`Blocked by:\n${related.blockedBy.map((t) => `- ${formatTask(t)}`).join("\n")}`)
    }
    if (related.blocks.length > 0) {
      lines.push(`Blocks:\n${related.blocks.map((t) => `- ${formatTask(t)}`).join("\n")}`)
    }

    const comments = await ctx.storage.getTaskComments(task.id)
    if (comments.length > 0) {
      lines.push(`Comments:\n${comments.map((c) => `- [${c.id}] ${commentAuthor(c)}: ${c.content}`).join("\n")}`)
    }

    const project = await ctx.storage.getBranch(task.branchId)
    const projectLabel = project ? `${project.name} (${project.id})` : task.branchId
    lines.push(`Project: ${projectLabel}`)
    lines.push(`Created: ${task.createdAt}`)

    return {success: true, data: lines.join("\n")}
  },
}

function commentAuthor(comment: TaskComment): string {
  if (comment.kind === "manual") return "user"

  return comment.provider ?? comment.kind
}
