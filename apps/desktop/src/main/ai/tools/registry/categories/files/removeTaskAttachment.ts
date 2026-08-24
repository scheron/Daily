import type {RegisteredTool} from "../../types"

export const removeTaskAttachment: RegisteredTool = {
  name: "remove_task_attachment",
  description: "Remove a file attachment from a task.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID."},
      file_id: {type: "string", description: "File ID to remove."},
    },
    required: ["task_id", "file_id"],
  },
  isWrite: true,
  isDestructive: true,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    const fileId = params.file_id as string

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (!fileId) {
      return {success: false, error: "file_id is required"}
    }

    const task = await ctx.storage.getTask(taskId)
    if (!task) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    if (!task.attachments.includes(fileId)) {
      return {success: false, error: `File ${fileId} is not attached to task ${taskId}`}
    }

    await ctx.storage.removeTaskAttachment(taskId, fileId)

    return {
      success: true,
      data: `Attachment removed from task: ${fileId}`,
      changedEntities: [
        {type: "file", id: fileId, action: "deleted"},
        {type: "task", id: taskId, action: "updated"},
      ],
    }
  },
}
