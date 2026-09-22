import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const saveTaskComment: RegisteredTool = {
  name: "save_task_comment",
  description:
    "Write a comment on a task, or rewrite an existing one by passing comment_id. Use to leave a note on a task without touching its content. Read existing comments with get_task. The comment is always marked as written by Daily's own assistant — that mark cannot be set from here.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task to comment on. Required when writing a new comment. Get from list_tasks or search_tasks."},
      comment_id: {type: "string", description: "Comment ID to rewrite. Omit to write a new comment. Get from get_task."},
      content: {type: "string", description: "The comment text, as Markdown."},
    },
    required: ["content"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const content = params.content as string
    if (!content?.trim()) {
      return {success: false, error: "content is required"}
    }

    const commentId = params.comment_id as string | undefined
    if (commentId) {
      const changeset = await ctx.storage.updateTaskComment(commentId, content)
      const updated = changeset.comments?.upserted?.[0]
      if (!updated) {
        return {success: false, error: `Comment not found: ${commentId}`}
      }

      return {
        success: true,
        data: `Comment updated on task ${updated.taskId}: ${updated.id}`,
        changedEntities: [{type: "comment", id: updated.id, action: "updated"}],
      }
    }

    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required when writing a new comment"}
    }

    const changeset = await ctx.storage.createTaskComment(taskId, content, {kind: "agent"})
    const created = changeset.comments?.upserted?.[0]
    if (!created) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Comment added to task ${taskId}: ${created.id}`,
      changedEntities: [{type: "comment", id: created.id, action: "created"}],
    }
  },
}
