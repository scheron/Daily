import type {RegisteredTool} from "../../types"

export const deleteTask: RegisteredTool = {
  name: "delete_task",
  description:
    "Move a task to trash (soft delete). Task can be restored later with restore_task. Use when user says 'delete', 'remove', 'trash'. For permanent deletion, use permanently_delete_task.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to move to trash."},
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

    const deleted = await ctx.storage.deleteTask(taskId)

    if (!deleted) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Task moved to trash: ${taskId}`,
      changedEntities: [{type: "task", id: taskId, action: "deleted"}],
    }
  },
}
