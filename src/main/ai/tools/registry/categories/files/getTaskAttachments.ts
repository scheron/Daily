import type {RegisteredTool} from "../../types"

export const getTaskAttachments: RegisteredTool = {
  name: "get_task_attachments",
  description: "List file attachments on a task.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID."},
    },
    required: ["task_id"],
  },
  isWrite: false,
  isDestructive: false,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const task = await ctx.storage.getTask(taskId)
    if (!task) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    if (task.attachments.length === 0) {
      return {success: true, data: `No attachments on task "${task.content.split("\n")[0].slice(0, 50)}".`}
    }

    const files = await ctx.storage.getFiles(task.attachments)

    if (files.length === 0) {
      return {success: true, data: `Task references ${task.attachments.length} file(s) but none could be loaded.`}
    }

    const fileList = files
      .map((f, i) => {
        const sizeKb = Math.round(f.size / 1024)
        const sizeLabel = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`
        return `${i + 1}. ${f.name} (${f.mimeType}, ${sizeLabel}) — ID: ${f.id}`
      })
      .join("\n")

    return {success: true, data: `Attachments for task (${files.length}):\n${fileList}`}
  },
}
