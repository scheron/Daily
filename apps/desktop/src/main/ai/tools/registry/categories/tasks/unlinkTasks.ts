import {toTaskRelationId} from "@daily/protocol"

import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const unlinkTasks: RegisteredTool = {
  name: "unlink_tasks",
  description: "Remove the blocking link between two tasks, whichever direction it goes. Asks the user to confirm first.",
  parameters: {
    type: "object",
    properties: {
      task_id: {type: "string", description: "One of the two linked tasks. Get IDs from list_tasks or search_tasks."},
      other_task_id: {type: "string", description: "The other task it is linked with, whichever direction the link goes."},
    },
    required: ["task_id", "other_task_id"],
  },
  isWrite: true,
  isDestructive: true,
  async execute(params, ctx) {
    const taskId = params.task_id as string
    const otherId = params.other_task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (!otherId) {
      return {success: false, error: "other_task_id is required"}
    }

    const current = await ctx.storage.getTaskRelations(taskId)
    const isLinked = current.blockedBy.some((task) => task.id === otherId) || current.blocks.some((task) => task.id === otherId)
    if (!isLinked) {
      return {success: false, error: `Tasks are not linked: ${taskId} and ${otherId}`}
    }

    const changeset = await ctx.storage.setTaskRelations(taskId, {
      blockedBy: current.blockedBy.map((task) => task.id).filter((id) => id !== otherId),
      blocks: current.blocks.map((task) => task.id).filter((id) => id !== otherId),
    })

    const unlinked = changeset.relations?.removed?.includes(toTaskRelationId(taskId, otherId))
    if (!unlinked) {
      return {success: false, error: `Tasks are not linked: ${taskId} and ${otherId}`}
    }

    return {
      success: true,
      data: `Unlinked: ${taskId} and ${otherId}`,
      changedEntities: [
        {type: "task", id: taskId, action: "updated"},
        {type: "task", id: otherId, action: "updated"},
      ],
    }
  },
}
