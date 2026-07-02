import {formatTask} from "@/ai/utils/formatters"

import type {RegisteredTool} from "../../types"

export const discardTask: RegisteredTool = {
  name: "discard_task",
  description:
    "Mark a task as discarded/cancelled (not done, but no longer needed). Use when user says 'cancel', 'skip', 'won't do', 'not needed anymore'. Different from delete_task - discarded tasks stay visible but marked as cancelled.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to discard. Get from list_tasks first."},
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

    const updated = await ctx.storage.updateTask(taskId, {status: "discarded"})

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Task discarded: ${formatTask(updated)}`,
      changedEntities: [{type: "task", id: updated.id, action: "updated"}],
    }
  },
}
