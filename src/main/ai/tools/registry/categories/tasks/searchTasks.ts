import {formatTask} from "../../helpers"

import type {RegisteredTool} from "../../types"

export const searchTasks: RegisteredTool = {
  name: "search_tasks",
  description:
    "Search all tasks by content text. Returns matching tasks across all dates. Use when user wants to find a task but doesn't know the exact date. Example: 'find all tasks about meeting' or 'search for project tasks'.",
  parameters: {
    type: "object",
    properties: {
      query: {type: "string", description: "Search text to find in task content."},
    },
    required: ["query"],
  },
  isWrite: false,
  isDestructive: false,
  async execute(params, ctx) {
    const query = params.query as string
    if (!query) {
      return {success: false, error: "query is required"}
    }

    const results = await ctx.storage.searchTasks(query)

    if (results.length === 0) {
      return {success: true, data: `No tasks found matching "${query}"`}
    }

    const taskList = results
      .map((r, i) => {
        const project = r.branch ? `${r.branch.name} (${r.branch.id})` : `Unknown (${r.task.branchId})`
        return `${i + 1}. ${formatTask(r.task)} [project: ${project}] (score: ${r.score.toFixed(2)})`
      })
      .join("\n")
    return {success: true, data: `Search results for "${query}" (${results.length} found):\n${taskList}`}
  },
}
