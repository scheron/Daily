import {formatTask} from "@/ai/utils/formatTask"

import type {RegisteredTool} from "../../types"

export const moveTaskToProject: RegisteredTool = {
  name: "move_task_to_project",
  description: "Move a task to another project. Use when user asks to transfer a task between projects/branches.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to move."},
      project_id: {type: "string", description: "Target project ID. Get IDs from list_projects."},
    },
    required: ["task_id", "project_id"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    const projectId = params.project_id as string

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (!projectId) {
      return {success: false, error: "project_id is required"}
    }

    const [task, branch] = await Promise.all([ctx.storage.getTask(taskId), ctx.storage.getBranch(projectId)])
    if (!task) {
      return {success: false, error: `Task not found: ${taskId}`}
    }
    if (!branch) {
      return {success: false, error: `Project not found: ${projectId}`}
    }

    if (task.branchId === branch.id) {
      return {success: true, data: `Task already in project "${branch.name}": ${formatTask(task)}`}
    }

    const updated = await ctx.storage.updateTask(taskId, {branchId: branch.id})
    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Task moved to project "${branch.name}": ${formatTask(updated)}`,
      changedEntities: [{type: "task", id: updated.id, action: "moved"}],
    }
  },
}
