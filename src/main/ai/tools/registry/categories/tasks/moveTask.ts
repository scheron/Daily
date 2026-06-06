import {formatTask} from "@/ai/utils/formatTask"

import type {RegisteredTool} from "../../types"

export const moveTask: RegisteredTool = {
  name: "move_task",
  description:
    "Move/reschedule a task to a different date. Use when user says 'move to', 'reschedule', 'postpone', 'push to tomorrow'. Example: 'move the dentist task to next Monday'.",
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

    const updated = await ctx.storage.updateTask(taskId, {scheduled: {date}})

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
