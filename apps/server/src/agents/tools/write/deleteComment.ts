import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {requireString} from "../input"

import type {AgentTool} from "../types"

export const deleteCommentTool: AgentTool = {
  name: "delete_comment",
  description: "Soft-deletes one comment by id. Nothing is ever removed for good.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The comment id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const deleted = await ctx.core.taskCommentsService.deleteComment(id)
    if (!deleted) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No comment "${id}".`)

    return {id: deleted}
  },
}
