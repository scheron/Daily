import {formatDuration} from "@/ai/utils/formatDuration"
import {formatTask} from "@/ai/utils/formatTask"

import type {RegisteredTool} from "../../types"

export const getTask: RegisteredTool = {
  name: "get_task",
  description:
    "Get detailed information about a single task by its ID. Use when you need full task details or to verify a task exists before modifying it.",
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

    const lines = [`Task details:\n${formatTask(task, false)}`, `Date: ${task.scheduled.date}`]

    if (task.estimatedTime > 0 || task.spentTime > 0) {
      const est = formatDuration(task.estimatedTime)
      const spent = formatDuration(task.spentTime)
      let timeLine = `Time — estimated: ${est}, spent: ${spent}`
      if (task.estimatedTime > 0 && task.spentTime > 0) {
        const pct = Math.round((task.spentTime / task.estimatedTime) * 100)
        timeLine += ` (${pct}%)`
      }
      lines.push(timeLine)
    }

    if (task.attachments.length > 0) {
      lines.push(`Attachments: ${task.attachments.length} file(s) — use get_task_attachments for details`)
    }

    const project = await ctx.storage.getBranch(task.branchId)
    const projectLabel = project ? `${project.name} (${project.id})` : task.branchId
    lines.push(`Project: ${projectLabel}`)
    lines.push(`Created: ${task.createdAt}`)

    return {success: true, data: lines.join("\n")}
  },
}
