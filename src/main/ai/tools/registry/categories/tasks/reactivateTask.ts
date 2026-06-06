import {formatTask} from "@/ai/utils/formatTask"

import type {RegisteredTool} from "../../types"

export const reactivateTask: RegisteredTool = {
  name: "reactivate_task",
  description:
    "Reactivate a completed or discarded task back to active status. Use when user wants to 'undo' completion or 'uncancel' a task. Example: 'actually I didn't finish that task' or 'reopen the report task'.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to reactivate."},
    },
    required: ["task_id"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const updated = await ctx.storage.updateTask(taskId, {status: "active"})

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Task reactivated: ${formatTask(updated)}`,
      changedEntities: [{type: "task", id: updated.id, action: "updated"}],
    }
  },
}
