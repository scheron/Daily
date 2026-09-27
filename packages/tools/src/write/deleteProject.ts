import {MAIN_BRANCH_ID} from "@daily/protocol"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

export const deleteProjectTool: Tool = {
  name: "delete_project",
  description:
    'Soft-deletes one project by id, along with its tasks, milestones and tags. Nothing is ever removed for good. "main" cannot be deleted.',
  mode: "delete",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The project id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")
    if (id === MAIN_BRANCH_ID) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"main" cannot be deleted.')

    const changeset = await ctx.workStorage.deleteBranch(id)
    const deleted = changeset.branches?.removed?.[0]
    if (!deleted) throw new ToolError(ToolErrorCode.NOT_FOUND, `No project "${id}".`)

    return {id: deleted}
  },
}
