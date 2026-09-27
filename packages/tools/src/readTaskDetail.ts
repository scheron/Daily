import {taskFiles} from "./attachments"
import {ToolError} from "./errors/ToolError"
import {ToolErrorCode} from "./errors/ToolErrorCode"
import {taskDetailView} from "./views"

import type {Task} from "@daily/protocol"
import type {ToolContext} from "./types"
import type {TaskDetailView} from "./views"

/** Reads one task in full — project name, both relation sides, history, attachments and comments — or throws `NOT_FOUND`. */
export async function readTaskDetail(ctx: ToolContext, id: Task["id"]): Promise<TaskDetailView> {
  const task = await ctx.workStorage.getTask(id)
  if (!task) throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${id}".`)

  const branch = await ctx.workStorage.getBranch(task.branchId)
  const relations = await ctx.workStorage.getRelationsOfTask(task.id)
  const history = await ctx.workStorage.getHistoryByTask(task.id)
  const comments = await ctx.workStorage.getCommentsOfTask(task.id)
  const files = await taskFiles(ctx, task)
  const attachments = files.map((ref) => ({
    id: ref.file.id,
    name: ref.file.name,
    mimeType: ref.file.mimeType,
    size: ref.file.size,
    onServer: ref.onServer,
  }))
  const movedCounts = await ctx.workStorage.getMoveCounts()

  return taskDetailView(task, branch?.name ?? "", {
    blockedBy: relations.blockedBy,
    blocks: relations.blocks,
    history,
    attachments,
    comments,
    movedCount: movedCounts[task.id] ?? 0,
  })
}
