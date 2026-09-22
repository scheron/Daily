import {AgentToolError} from "../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../errors/agent/AgentToolErrorCode"
import {taskFiles} from "../attachments"
import {taskDetailView} from "../views"

import type {Task} from "@daily/protocol"
import type {AgentToolContext} from "../AgentWorkspace"
import type {TaskDetailView} from "../views"

/** Reads one task in full — project name, both relation sides, history, attachments and comments — or throws `NOT_FOUND`. */
export async function readTaskDetail(ctx: AgentToolContext, id: Task["id"]): Promise<TaskDetailView> {
  const task = await ctx.core.tasksService.getTask(id)
  if (!task) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

  const branch = await ctx.core.branchesService.getBranch(task.branchId)
  const relations = await ctx.core.taskRelationsService.getRelationsOfTask(task.id)
  const history = await ctx.core.tasksService.getHistoryByTask(task.id)
  const comments = await ctx.core.taskCommentsService.getCommentsOfTask(task.id)
  const files = await taskFiles(ctx, task)
  const attachments = files.map((ref) => ({
    id: ref.file.id,
    name: ref.file.name,
    mimeType: ref.file.mimeType,
    size: ref.file.size,
    onServer: ref.onServer,
  }))

  return taskDetailView(task, branch?.name ?? "", {blockedBy: relations.blockedBy, blocks: relations.blocks, history, attachments, comments})
}
