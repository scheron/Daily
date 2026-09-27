import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

export const deleteMilestoneTool: Tool = {
  name: "delete_milestone",
  description: "Soft-deletes one milestone by id, clearing it from the tasks it held. Nothing is ever removed for good.",
  mode: "delete",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The milestone id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const changeset = await ctx.workStorage.deleteMilestone(id)
    const deleted = changeset.milestones?.removed?.[0]
    if (!deleted) throw new ToolError(ToolErrorCode.NOT_FOUND, `No milestone "${id}".`)

    return {id: deleted}
  },
}
