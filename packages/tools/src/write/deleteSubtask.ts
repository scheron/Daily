import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

export const deleteSubtaskTool: Tool = {
  name: "delete_subtask",
  description: "Soft-deletes one subtask by id. Nothing is ever removed for good.",
  mode: "delete",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The subtask id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const changeset = await ctx.workStorage.deleteSubtask(id)
    const deleted = changeset.subtasks?.removed?.[0]
    if (!deleted) throw new ToolError(ToolErrorCode.NOT_FOUND, `No subtask "${id}".`)

    return {id: deleted}
  },
}
