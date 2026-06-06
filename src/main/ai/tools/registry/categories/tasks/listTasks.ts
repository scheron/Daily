import {formatTask} from "@/ai/utils/formatTask"
import {getTodayDate} from "@/ai/utils/getTodayDate"

import type {RegisteredTool} from "../../types"

export const listTasks: RegisteredTool = {
  name: "list_tasks",
  description:
    "Get tasks for a specific date. Use this to see what tasks exist before making changes. Returns task list with IDs (needed for other operations), content, status (active/done/discarded), scheduled time, and tags. Example: User asks 'what do I have today?' or 'show my tasks for tomorrow'.",
  parameters: {
    type: "object",
    properties: {
      date: {type: "string", description: "Date in YYYY-MM-DD format. Defaults to today. Example: '2024-03-15'"},
      include_done: {type: "boolean", description: "Include completed tasks in results. Defaults to true."},
      project_id: {type: "string", description: "Optional project ID to list tasks from a specific project."},
    },
  },
  isWrite: false,
  isDestructive: false,
  async execute(params, ctx) {
    const date = (params.date as string) || getTodayDate()
    const includeDone = params.include_done !== false
    const projectId = params.project_id as string | undefined
    let branchId: string | undefined
    let projectName: string | undefined

    if (projectId) {
      const branch = await ctx.storage.getBranch(projectId)
      if (!branch) {
        return {success: false, error: `Project not found: ${projectId}`}
      }
      branchId = branch.id
      projectName = branch.name
    }

    let tasks = await ctx.storage.getTaskList({from: date, to: date, branchId})

    if (!includeDone) {
      tasks = tasks.filter((t) => t.status !== "done")
    }

    tasks.sort((a, b) => a.scheduled.time.localeCompare(b.scheduled.time))

    if (tasks.length === 0) {
      const scope = projectName ? ` in project "${projectName}"` : ""
      return {success: true, data: `No tasks found for ${date}${scope}`}
    }

    const taskList = tasks.map((t, i) => `${i + 1}. ${formatTask(t)}`).join("\n")
    const scope = projectName ? ` in project "${projectName}"` : ""
    return {success: true, data: `Tasks for ${date}${scope} (${tasks.length} total):\n${taskList}`}
  },
}
