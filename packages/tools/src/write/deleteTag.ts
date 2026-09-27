import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

export const deleteTagTool: Tool = {
  name: "delete_tag",
  description: "Soft-deletes one tag by id. Nothing is ever removed for good.",
  mode: "delete",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The tag id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const changeset = await ctx.workStorage.deleteTag(id)
    const deleted = changeset.tags?.removed?.[0]
    if (!deleted) throw new ToolError(ToolErrorCode.NOT_FOUND, `No tag "${id}".`)

    return {id: deleted}
  },
}
