import {formatTask} from "@/ai/utils/formatters"

import type {RegisteredTool} from "../../types"

export const removeTaskTags: RegisteredTool = {
  name: "remove_task_tags",
  description: "Remove tags from a task. Use list_tasks or get_task first to see which tags the task currently has.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to remove tags from."},
      tag_ids: {type: "array", description: "Array of tag IDs to remove."},
    },
    required: ["task_id", "tag_ids"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    const tagIds = params.tag_ids as string[]

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (!tagIds || tagIds.length === 0) {
      return {success: false, error: "tag_ids is required"}
    }

    const updated = await ctx.storage.removeTaskTags(taskId, tagIds)

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Tags removed from task: ${formatTask(updated)}`,
      changedEntities: [{type: "task", id: updated.id, action: "updated"}],
    }
  },
}
