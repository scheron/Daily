import {formatTask} from "@main/ai/utils/formatters"

import type {RegisteredTool} from "../../types"

export const getBacklog: RegisteredTool = {
  name: "get_backlog",
  description:
    "List tasks that have no scheduled day — the backlog. list_tasks and get_day_summary never include these. Use whenever the user asks what's left, pending, or waiting without a day. Example: 'what's still on my plate?' or 'what's in my backlog?'.",
  parameters: {
    type: "object",
    properties: {
      limit: {type: "number", description: "Maximum tasks to return. Defaults to all."},
      project_id: {type: "string", description: "Optional project ID to view the backlog for a specific project."},
    },
  },
  isWrite: false,
  isDestructive: false,
  async execute(params, ctx) {
    const limit = params.limit as number | undefined
    const projectId = params.project_id as string | undefined
    let targetBranchId: string | undefined
    let projectName: string | undefined

    if (projectId) {
      const branch = await ctx.storage.getBranch(projectId)
      if (!branch) {
        return {success: false, error: `Project not found: ${projectId}`}
      }
      targetBranchId = branch.id
      projectName = branch.name
    }

    const tasks = await ctx.storage.getBacklogList({limit, branchId: targetBranchId})

    const scope = projectName ? ` in project "${projectName}"` : ""

    if (tasks.length === 0) {
      return {success: true, data: `Backlog is empty${scope}`}
    }

    const taskList = tasks.map((t, i) => `${i + 1}. ${formatTask(t)}`).join("\n")
    return {success: true, data: `Backlog${scope} (${tasks.length} total):\n${taskList}`}
  },
}
