import {extractFileIds} from "@daily/core/utils/files/extractFileIds"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

export const deleteAttachmentTool: Tool = {
  name: "delete_attachment",
  description:
    "Soft-deletes one file by id; its bytes stay until garbage collection purges the row. Refuses while any task's text or subtask still links to it, trashed tasks included.",
  mode: "delete",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The file id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const tasks = await ctx.workStorage.getTaskList({includeDeleted: true, includeBacklog: true})
    for (const task of tasks) {
      const subtasks = await ctx.workStorage.getSubtasksOfTask(task.id)
      const texts = [task.content, ...subtasks.map((subtask) => subtask.content)]
      if (texts.some((text) => extractFileIds(text).includes(id))) {
        throw new ToolError(ToolErrorCode.ATTACHMENT_IN_USE, `Attachment "${id}" is still linked from task "${task.id}"'s text or subtasks.`)
      }
    }

    const deleted = await ctx.workStorage.deleteFile(id)
    if (!deleted) throw new ToolError(ToolErrorCode.NOT_FOUND, `No attachment "${id}".`)

    return {id}
  },
}
