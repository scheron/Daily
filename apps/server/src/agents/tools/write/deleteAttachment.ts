import {extractFileIds} from "@daily/core/utils/files/extractFileIds"

import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {requireString} from "../input"

import type {AgentTool} from "../types"

export const deleteAttachmentTool: AgentTool = {
  name: "delete_attachment",
  description: "Deletes one file by id, bytes and all. Refuses while any task's text still links to it, trashed tasks included.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The file id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const tasks = await ctx.core.tasksService.getTaskList({includeDeleted: true, includeBacklog: true})
    const referencedBy = tasks.find((task) => extractFileIds(task.content).includes(id))
    if (referencedBy) {
      throw new AgentToolError(AgentToolErrorCode.ATTACHMENT_IN_USE, `Attachment "${id}" is still linked from task "${referencedBy.id}"'s text.`)
    }

    const deleted = await ctx.core.filesService.deleteFile(id)
    if (!deleted) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No attachment "${id}".`)

    return {id}
  },
}
