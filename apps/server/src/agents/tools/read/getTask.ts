import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {taskFiles} from "../../attachments"
import {taskDetailView} from "../../views"
import {requireString} from "../input"

import type {AttachmentView} from "../../views"
import type {AgentTool} from "../types"

export const getTaskTool: AgentTool = {
  name: "get_task",
  description: "Answers one task in full: its fields, tags, milestone, both relation sides, its history newest first, and its attachments.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The task id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const task = await ctx.core.tasksService.getTask(id)
    if (!task) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

    const branch = await ctx.core.branchesService.getBranch(task.branchId)
    const relations = await ctx.core.taskRelationsService.getRelationsOfTask(task.id)
    const history = await ctx.core.tasksService.getHistoryByTask(task.id)
    const files = await taskFiles(ctx, task)
    const attachments: AttachmentView[] = files.map((ref) => ({
      id: ref.file.id,
      name: ref.file.name,
      mimeType: ref.file.mimeType,
      size: ref.file.size,
      onServer: ref.onServer,
    }))

    return taskDetailView(task, branch?.name ?? "", {blockedBy: relations.blockedBy, blocks: relations.blocks, history, attachments})
  },
}
