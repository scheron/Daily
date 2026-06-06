import {formatTask} from "../../helpers"

import type {RegisteredTool} from "../../types"

export const addTaskTags: RegisteredTool = {
  name: "add_task_tags",
  description:
    "Add tags to a task for categorization. First use list_tags to see available tags and get their IDs. If needed tag doesn't exist, use create_tag first. Example: 'add work tag to the meeting task'.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to add tags to."},
      tag_ids: {type: "array", description: "Array of tag IDs to add. Get IDs from list_tags."},
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

    const updated = await ctx.storage.addTaskTags(taskId, tagIds)

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Tags added to task: ${formatTask(updated)}`,
      changedEntities: [{type: "task", id: updated.id, action: "updated"}],
    }
  },
}
