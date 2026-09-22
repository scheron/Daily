import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const deleteTaskComment: RegisteredTool = {
  name: "delete_task_comment",
  description: "Delete a comment from a task (soft delete). Get comment IDs from get_task. Use when the user asks to remove a comment or note.",
  parameters: {
    type: "object",
    properties: {
      comment_id: {type: "string", description: "Comment ID to delete. Get from get_task."},
    },
    required: ["comment_id"],
  },
  isWrite: true,
  isDestructive: true,
  async execute(params, ctx) {
    const commentId = params.comment_id as string
    if (!commentId) {
      return {success: false, error: "comment_id is required"}
    }

    const changeset = await ctx.storage.deleteTaskComment(commentId)
    const deleted = changeset.comments?.removed?.includes(commentId)

    if (!deleted) {
      return {success: false, error: `Comment not found: ${commentId}`}
    }

    return {
      success: true,
      data: `Comment deleted: ${commentId}`,
      changedEntities: [{type: "comment", id: commentId, action: "deleted"}],
    }
  },
}
