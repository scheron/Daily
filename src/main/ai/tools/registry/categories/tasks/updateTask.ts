import {formatTask} from "../../helpers"

import type {RegisteredTool} from "../../types"

export const updateTask: RegisteredTool = {
  name: "update_task",
  description:
    "Update an existing task's content, date, time, status, estimated time, or project. Use for editing task text, rescheduling, changing status, or moving between projects. First use list_tasks to find the task_id. For simple status changes, prefer complete_task, discard_task, or reactivate_task instead.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to update. Get from list_tasks or search_tasks."},
      content: {type: "string", description: "New task content/description."},
      date: {type: "string", description: "New scheduled date (YYYY-MM-DD). Use move_task for just changing date."},
      time: {type: "string", description: "New scheduled time (HH:MM 24h format)."},
      status: {
        type: "string",
        description: "New status: 'active' (in progress), 'done' (completed), 'discarded' (cancelled).",
        enum: ["active", "done", "discarded"],
      },
      estimated_minutes: {
        type: "number",
        description: "Estimated time for the task in minutes. Example: 30 for half an hour, 120 for 2 hours.",
      },
      project_id: {type: "string", description: "Target project ID to move the task to."},
    },
    required: ["task_id"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const updates: Record<string, unknown> = {}

    if (params.content !== undefined) updates.content = params.content
    if (params.status !== undefined) updates.status = params.status

    if (params.date !== undefined || params.time !== undefined) {
      updates.scheduled = {}
      if (params.date !== undefined) (updates.scheduled as Record<string, string>).date = params.date as string
      if (params.time !== undefined) (updates.scheduled as Record<string, string>).time = params.time as string
    }

    if (params.estimated_minutes !== undefined) {
      updates.estimatedTime = Math.max(0, Math.round(params.estimated_minutes as number)) * 60
    }

    if (params.project_id !== undefined) {
      const projectId = params.project_id as string
      const branch = await ctx.storage.getBranch(projectId)
      if (!branch) {
        return {success: false, error: `Project not found: ${projectId}`}
      }
      updates.branchId = branch.id
    }

    const updated = await ctx.storage.updateTask(taskId, updates)

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Task updated: ${formatTask(updated)}`,
      changedEntities: [{type: "task", id: updated.id, action: "updated"}],
    }
  },
}
