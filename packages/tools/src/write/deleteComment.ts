import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

export const deleteCommentTool: Tool = {
  name: "delete_comment",
  description: "Soft-deletes one comment by id. Nothing is ever removed for good.",
  mode: "delete",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The comment id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const changeset = await ctx.workStorage.deleteComment(id)
    const deleted = changeset.comments?.removed?.[0]
    if (!deleted) throw new ToolError(ToolErrorCode.NOT_FOUND, `No comment "${id}".`)

    return {id: deleted}
  },
}
