import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

export const deleteTaskTool: Tool = {
  name: "delete_task",
  description: "Soft-deletes one task by id and clears it from any relation naming it as a blocker. Nothing is ever removed for good.",
  mode: "delete",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The task id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const changeset = await ctx.workStorage.deleteTask(id, ctx.source)
    if (!changeset.tasks?.removed?.includes(id)) throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${id}".`)

    const task = await ctx.workStorage.getTask(id)

    return {id, deletedAt: task?.deletedAt ?? null}
  },
}
