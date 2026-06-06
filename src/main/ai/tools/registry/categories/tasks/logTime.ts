import {formatDuration} from "@/ai/utils/formatDuration"
import {formatTask} from "@/ai/utils/formatTask"

import type {RegisteredTool} from "../../types"

export const logTime: RegisteredTool = {
  name: "log_time",
  description:
    "Log time spent on a task. Use when user says 'I spent X minutes/hours on...', 'log time', 'track time'. Supports add (default), subtract, and set operations. Example: 'I spent 45 minutes on the report' or 'remove 10 minutes from task X'.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to log time for. Get from list_tasks or search_tasks."},
      minutes: {
        type: "number",
        description: "Number of minutes to log. Must be a positive number. Example: 30 for half an hour, 120 for 2 hours.",
      },
      operation: {
        type: "string",
        description: "How to apply the time: 'add' (default) adds to existing, 'subtract' removes from existing, 'set' replaces existing.",
        enum: ["add", "subtract", "set"],
      },
    },
    required: ["task_id", "minutes"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    const minutes = params.minutes as number
    const operation = (params.operation as string) || "add"

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (minutes === undefined || minutes === null) {
      return {success: false, error: "minutes is required"}
    }
    if (minutes < 0) {
      return {success: false, error: "minutes must be a positive number. Use operation='subtract' to remove time."}
    }

    const task = await ctx.storage.getTask(taskId)
    if (!task) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    const deltaSeconds = Math.round(minutes) * 60
    let newSpentTime: number

    switch (operation) {
      case "add":
        newSpentTime = task.spentTime + deltaSeconds
        break
      case "subtract":
        newSpentTime = Math.max(0, task.spentTime - deltaSeconds)
        break
      case "set":
        newSpentTime = deltaSeconds
        break
      default:
        return {success: false, error: `Invalid operation: ${operation}. Use 'add', 'subtract', or 'set'.`}
    }

    const updated = await ctx.storage.updateTask(taskId, {spentTime: newSpentTime})
    if (!updated) {
      return {success: false, error: `Failed to update task: ${taskId}`}
    }

    const label = formatDuration(newSpentTime)
    return {
      success: true,
      data: `Time logged (${operation}): ${formatTask(updated)}\nTotal spent: ${label}`,
      changedEntities: [{type: "task", id: updated.id, action: "updated"}],
    }
  },
}
