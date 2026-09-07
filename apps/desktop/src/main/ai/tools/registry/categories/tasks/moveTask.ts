import {formatTask} from "@main/ai/utils/formatters"

import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const moveTask: RegisteredTool = {
  name: "move_task",
  description:
    "Move/reschedule a task to a different date. Also works on a backlog task — it schedules the task onto this date. Use when user says 'move to', 'reschedule', 'postpone', 'push to tomorrow'. Example: 'move the dentist task to next Monday'.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to move."},
      date: {type: "string", description: "New date in YYYY-MM-DD format."},
    },
    required: ["task_id", "date"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    const date = params.date as string

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (!date) {
      return {success: false, error: "date is required"}
    }

    const updated = await ctx.storage.scheduleTask(taskId, {
      date,
      time: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Task moved to ${date}: ${formatTask(updated)}`,
      changedEntities: [{type: "task", id: updated.id, action: "moved"}],
    }
  },
}
