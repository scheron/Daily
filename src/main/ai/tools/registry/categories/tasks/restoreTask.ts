import {formatTask} from "@/ai/utils/formatTask"

import type {RegisteredTool} from "../../types"

export const restoreTask: RegisteredTool = {
  name: "restore_task",
  description: "Restore a deleted task from trash back to active tasks. Use get_deleted_tasks first to find the task_id.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to restore from trash."},
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

    const restored = await ctx.storage.restoreTask(taskId)

    if (!restored) {
      return {success: false, error: `Task not found in trash: ${taskId}`}
    }

    return {
      success: true,
      data: `Task restored: ${formatTask(restored)}`,
      changedEntities: [{type: "task", id: restored.id, action: "restored"}],
    }
  },
}
