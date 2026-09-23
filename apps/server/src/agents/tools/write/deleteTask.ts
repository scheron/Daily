import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {requireString} from "../input"

import type {AgentTool} from "../types"

export const deleteTaskTool: AgentTool = {
  name: "delete_task",
  description: "Soft-deletes one task by id and clears it from any relation naming it as a blocker. Nothing is ever removed for good.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The task id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const deleted = await ctx.core.tasksService.deleteTask(id, {kind: "mcp", provider: ctx.agent.name})
    if (!deleted) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

    await ctx.core.taskRelationsService.removeInvalidRelations([id])

    const task = await ctx.core.tasksService.getTask(id)

    return {id, deletedAt: task?.deletedAt ?? null}
  },
}
