import {planTaskRelations} from "@daily/protocol"

import type {Branch, Task, TaskRelation, TaskRelationSets} from "@daily/protocol"
import type {TaskModel} from "../models/TaskModel"
import type {TaskRelationModel} from "../models/TaskRelationModel"

export class TaskRelationsService {
  constructor(
    private relationModel: TaskRelationModel,
    private taskModel: TaskModel,
  ) {}

  /** Every live relation of every project, unfiltered by task state — the renderer's selectors filter. */
  async getRelationList(): Promise<TaskRelation[]> {
    return this.relationModel.getRelationList()
  }

  /** The task's live blockers and blocked tasks within its project, oldest link first. Empty for an unknown or deleted task. */
  async getRelationsOfTask(taskId: Task["id"]): Promise<{blockedBy: Task[]; blocks: Task[]}> {
    const task = this.taskModel.getTask(taskId)
    if (!task || task.deletedAt !== null) return {blockedBy: [], blocks: []}

    const relations = this.relationModel.getRelationsOfTasks([taskId])

    const blockedBy: Task[] = []
    const blocks: Task[] = []

    for (const relation of relations) {
      if (relation.blockedId === taskId) {
        const blocker = this.readLiveTaskInBranch(relation.blockerId, task.branchId)
        if (blocker) blockedBy.push(blocker)
      } else {
        const blocked = this.readLiveTaskInBranch(relation.blockedId, task.branchId)
        if (blocked) blocks.push(blocked)
      }
    }

    return {blockedBy, blocks}
  }

  async setTaskRelations(taskId: Task["id"], next: TaskRelationSets): Promise<{upserted: TaskRelation[]; removed: TaskRelation["id"][]}> {
    const task = this.taskModel.getTask(taskId)
    if (!task || task.deletedAt !== null) return {upserted: [], removed: []}
    if (this.namesOnlyItself(taskId, next)) return {upserted: [], removed: []}

    const tasks = this.taskModel.getTaskList({branchId: task.branchId, includeBacklog: true})
    const relations = this.relationModel.getRelationList()

    const plan = planTaskRelations({tasks, relations}, taskId, next)
    if (plan.linked.length === 0 && plan.unlinked.length === 0) return {upserted: [], removed: []}

    return this.relationModel.applyPlan(plan)
  }

  /** Soft-deletes the relations of these tasks whose ends are missing, deleted, or in different projects; returns the ids touched. */
  async removeInvalidRelations(taskIds: Task["id"][]): Promise<TaskRelation["id"][]> {
    const relations = this.relationModel.getRelationsOfTasks(taskIds)
    if (relations.length === 0) return []

    const invalidIds = relations.filter((relation) => this.isInvalidRelation(relation)).map((relation) => relation.id)
    if (invalidIds.length === 0) return []

    return this.relationModel.deleteRelations(invalidIds)
  }

  private readLiveTaskInBranch(taskId: Task["id"], branchId: Branch["id"]): Task | null {
    const task = this.taskModel.getTask(taskId)
    if (!task || task.deletedAt !== null || task.branchId !== branchId) return null

    return task
  }

  private namesOnlyItself(taskId: Task["id"], next: TaskRelationSets): boolean {
    const requested = [...next.blockedBy, ...next.blocks]
    return requested.length > 0 && requested.every((id) => id === taskId)
  }

  private isInvalidRelation(relation: TaskRelation): boolean {
    const blocker = this.taskModel.getTask(relation.blockerId)
    const blocked = this.taskModel.getTask(relation.blockedId)

    if (!blocker || !blocked) return true
    if (blocker.deletedAt !== null || blocked.deletedAt !== null) return true

    return blocker.branchId !== blocked.branchId
  }
}
