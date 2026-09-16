import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const linkTasks: RegisteredTool = {
  name: "link_tasks",
  description:
    "Make one task block another: the blocked task waits until the blocker is done. Both tasks must be in the same project, and the link must not make them wait on each other. Use when the user says a task depends on, waits for, or is blocked by another. Get IDs from list_tasks or search_tasks.",
  parameters: {
    type: "object",
    properties: {
      blocker_task_id: {type: "string", description: "The task that has to be done first."},
      blocked_task_id: {type: "string", description: "The task that waits on the blocker."},
    },
    required: ["blocker_task_id", "blocked_task_id"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const blockerId = params.blocker_task_id as string
    const blockedId = params.blocked_task_id as string
    if (!blockerId) {
      return {success: false, error: "blocker_task_id is required"}
    }
    if (!blockedId) {
      return {success: false, error: "blocked_task_id is required"}
    }

    const current = await ctx.storage.getTaskRelations(blockedId)
    if (current.blockedBy.some((task) => task.id === blockerId)) {
      return {success: true, data: `Already linked: ${blockerId} blocks ${blockedId}`}
    }

    const changeset = await ctx.storage.setTaskRelations(blockedId, {
      blockedBy: [...current.blockedBy.map((task) => task.id), blockerId],
      blocks: current.blocks.map((task) => task.id).filter((id) => id !== blockerId),
    })

    const linked = changeset.relations?.upserted?.some((relation) => relation.blockerId === blockerId && relation.blockedId === blockedId)
    if (!linked) {
      return {
        success: false,
        error: "Cannot link these tasks: both must exist, be different, belong to the same project, and must not end up waiting on each other.",
      }
    }

    return {
      success: true,
      data: `Linked: ${blockerId} now blocks ${blockedId}`,
      changedEntities: [
        {type: "task", id: blockerId, action: "updated"},
        {type: "task", id: blockedId, action: "updated"},
      ],
    }
  },
}
