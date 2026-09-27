import {extractFileIds} from "@daily/core/utils/files/extractFileIds"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

export const deleteAttachmentTool: Tool = {
  name: "delete_attachment",
  description:
    "Soft-deletes one file by id; its bytes stay until garbage collection purges the row. Refuses while any task's text still links to it, trashed tasks included.",
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
    const referencedBy = tasks.find((task) => extractFileIds(task.content).includes(id))
    if (referencedBy) {
      throw new ToolError(ToolErrorCode.ATTACHMENT_IN_USE, `Attachment "${id}" is still linked from task "${referencedBy.id}"'s text.`)
    }

    const deleted = await ctx.workStorage.deleteFile(id)
    if (!deleted) throw new ToolError(ToolErrorCode.NOT_FOUND, `No attachment "${id}".`)

    return {id}
  },
}
