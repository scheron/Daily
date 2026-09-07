import {formatTask} from "@main/ai/utils/formatters"

import type {RegisteredTool} from "../../types"

export const moveTaskToBacklog: RegisteredTool = {
  name: "move_task_to_backlog",
  description:
    "Move a task into the backlog, clearing its scheduled day. Use when user says 'move to backlog', 'unschedule', 'take off the calendar', 'no date yet'. The task is not lost — give it a day again with move_task. Example: 'move the read book task to the backlog'.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "Task ID to move to the backlog."},
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

    const updated = await ctx.storage.moveTaskToBacklog(taskId)

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {
      success: true,
      data: `Task moved to backlog: ${formatTask(updated)}`,
      changedEntities: [{type: "task", id: updated.id, action: "moved"}],
    }
  },
}
