import type {RegisteredTool} from "../../types"

export const permanentlyDeleteTask: RegisteredTool = {
  name: "permanently_delete_task",
  description:
    "PERMANENTLY delete a task - cannot be undone! Only use when user explicitly confirms permanent deletion. Ask for confirmation before using this.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to permanently delete."},
    },
    required: ["task_id"],
  },
  isWrite: true,
  isDestructive: true,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const deleted = await ctx.storage.permanentlyDeleteTask(taskId)

    if (!deleted) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Task permanently deleted: ${taskId}`,
      changedEntities: [{type: "task", id: taskId, action: "deleted"}],
    }
  },
}
