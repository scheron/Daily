import {formatTask} from "@/ai/utils/formatTask"

import type {RegisteredTool} from "../../types"

export const completeTask: RegisteredTool = {
  name: "complete_task",
  description:
    "Mark a task as completed/done. Use when user says 'done', 'finished', 'completed', 'check off'. Example: 'mark buy milk as done' or 'I finished the report'.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to mark as completed. Get from list_tasks first."},
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

    const updated = await ctx.storage.updateTask(taskId, {status: "done"})

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Task completed: ${formatTask(updated)}`,
      changedEntities: [{type: "task", id: updated.id, action: "updated"}],
    }
  },
}
