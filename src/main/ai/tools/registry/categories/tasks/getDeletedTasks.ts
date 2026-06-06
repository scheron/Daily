import {formatTask} from "../../helpers"

import type {RegisteredTool} from "../../types"

export const getDeletedTasks: RegisteredTool = {
  name: "get_deleted_tasks",
  description: "List tasks in trash that can be restored. Use when user asks about deleted tasks or wants to restore something.",
  parameters: {
    type: "object",
    properties: {
      limit: {type: "number", description: "Maximum tasks to return. Defaults to 20."},
      project_id: {type: "string", description: "Optional project ID to view trash for a specific project."},
    },
  },
  isWrite: false,
  isDestructive: false,
  async execute(params, ctx) {
    const limit = (params.limit as number) || 20
    const projectId = params.project_id as string | undefined
    let targetBranchId: string | undefined

    if (projectId) {
      const branch = await ctx.storage.getBranch(projectId)
      if (!branch) {
        return {success: false, error: `Project not found: ${projectId}`}
      }
      targetBranchId = branch.id
    }

    const tasks = await ctx.storage.getDeletedTasks({limit, branchId: targetBranchId})

    if (tasks.length === 0) {
      return {success: true, data: "No deleted tasks found"}
    }

    const taskList = tasks.map((t, i) => `${i + 1}. ${formatTask(t)} (deleted: ${t.deletedAt})`).join("\n")
    return {success: true, data: `Deleted tasks (${tasks.length}):\n${taskList}`}
  },
}
