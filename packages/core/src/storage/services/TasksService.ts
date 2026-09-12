import {
  completeScheduling,
  getOrderIndexBetween,
  getPreviousTaskOrderIndex,
  getTaskOrderValue,
  MAIN_BRANCH_ID,
  normalizeTaskOrderIndexes,
  schedulingForStatus,
  sortTasksByOrderIndex,
  statusForScheduling,
} from "@daily/protocol"
import {getToday, notNull, notUndefined} from "@daily/std"

import type {
  Branch,
  File,
  ISODate,
  Milestone,
  MoveTaskByOrderParams,
  Tag,
  Task,
  TaskEvent,
  TaskMovePosition,
  TaskScheduled,
  TaskStatus,
} from "@daily/protocol"
import type {PartialDeep} from "type-fest"
import type {TaskInternal} from "../../types/storage"
import type {TaskModel} from "../models/TaskModel"
import type {TaskEventsService} from "./TaskEventsService"

export class TasksService {
  constructor(
    private taskModel: TaskModel,
    private taskEvents: TaskEventsService,
  ) {}

  async getHistoryByTask(taskId: Task["id"]): Promise<TaskEvent[]> {
    return this.taskEvents.getHistoryByTask(taskId)
  }

  async getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getTaskList(params)
  }

  async getBacklogTasks(params?: {branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getBacklogTasks(params)
  }

  async getTasksByMilestone(milestoneId: Milestone["id"]): Promise<Task[]> {
    return this.taskModel.getTasksByMilestone(milestoneId)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this.taskModel.getTask(id)
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null> {
    const updatesTask: PartialDeep<TaskInternal> = {...updates} as any

    if (notUndefined(updates.tags)) {
      updatesTask.tags = (updates.tags as Tag[]).map((t) => t.id)
    }

    const before = this.taskModel.getTask(id)

    if (before && (notUndefined(updates.status) || notUndefined(updates.scheduled))) {
      const explicitStatus = updates.status as TaskStatus | undefined
      const current = notUndefined(updates.scheduled) ? (updates.scheduled as TaskScheduled | null) : before.scheduled
      const leavesBacklog = !explicitStatus && before.status === "backlog" && notNull(current)

      const status = explicitStatus ?? (leavesBacklog ? statusForScheduling(before.status, current) : before.status)

      updatesTask.scheduled = schedulingForStatus(status, current, getToday())

      if (status === "backlog" && before.status !== "backlog") {
        updatesTask.orderIndex = getPreviousTaskOrderIndex(this.taskModel.getBacklogTasks({branchId: before.branchId}))
      }

      if (leavesBacklog) {
        const completed = completeScheduling(updatesTask.scheduled as TaskScheduled)

        updatesTask.status = status
        updatesTask.scheduled = completed
        updatesTask.orderIndex = getPreviousTaskOrderIndex(
          this.taskModel.getTaskList({from: completed.date, to: completed.date, branchId: before.branchId}),
        )
      }
    }

    if (before) {
      const branchId = (notUndefined(updates.branchId) ? updates.branchId : before.branchId) as Branch["id"]
      const branchChanged = notUndefined(updates.branchId) && updates.branchId !== before.branchId

      if (notUndefined(updates.milestoneId) && updates.milestoneId !== null) {
        const milestoneId = updates.milestoneId as Milestone["id"]
        if (!this.taskModel.milestoneBelongsToBranch(milestoneId, branchId)) {
          updatesTask.milestoneId = null
        }
      } else if (branchChanged && !notUndefined(updates.milestoneId)) {
        updatesTask.milestoneId = null
      }
    }

    const after = this.taskModel.updateTask(id, updatesTask as Partial<TaskInternal>)
    if (before && after) this.taskEvents.recordUpdate(before, after)

    return after
  }

  async createTask(task: Task): Promise<Task | null> {
    const scheduled = schedulingForStatus(task.status, task.scheduled ?? null, getToday())
    const branchId = task.branchId ?? MAIN_BRANCH_ID
    const orderIndex = task.status === "backlog" ? getPreviousTaskOrderIndex(this.taskModel.getBacklogTasks({branchId})) : task.orderIndex

    const newTask = {
      ...task,
      scheduled,
      orderIndex,
      tags: task.tags ? task.tags.map((t) => t.id) : [],
    } as Omit<TaskInternal, "id" | "createdAt" | "updatedAt">

    const created = this.taskModel.createTask(newTask)
    if (created) this.taskEvents.record(created, "created")

    return created
  }

  async moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Task | null> {
    const sourceTask = this.taskModel.getTask(params.taskId)
    if (!sourceTask) return null

    const position = params.position ?? "before"
    const targetTaskId = params.targetTaskId ?? null
    const targetStatus = params.targetStatus ?? sourceTask.status

    if (targetTaskId === sourceTask.id && targetStatus === sourceTask.status) {
      return this.getTask(sourceTask.id)
    }

    const scheduled = schedulingForStatus(targetStatus, sourceTask.scheduled, params.activeDate)

    const scopeTasks =
      targetStatus === "backlog"
        ? this.taskModel.getBacklogTasks({branchId: sourceTask.branchId})
        : this.taskModel.getTaskList({from: scheduled!.date, to: scheduled!.date, branchId: sourceTask.branchId})

    const scopeTaskById = new Map(scopeTasks.map((task) => [task.id, task]))
    const tasksWithoutSource = scopeTasks.filter((task) => task.id !== sourceTask.id)
    const destinationScope = tasksWithoutSource.filter((task) => task.status === targetStatus)
    const orderedDestinationScope = sortTasksByOrderIndex(destinationScope)
    const insertAt = resolveInsertIndex(orderedDestinationScope, targetTaskId, position)

    const prevTask = orderedDestinationScope[insertAt - 1] ?? null
    const nextTask = orderedDestinationScope[insertAt] ?? null
    const nextOrderIndex = getOrderIndexBetween(prevTask ? getTaskOrderValue(prevTask) : null, nextTask ? getTaskOrderValue(nextTask) : null)

    if (notNull(nextOrderIndex)) {
      const updates: Partial<TaskInternal> = {orderIndex: nextOrderIndex, scheduled}
      if (targetStatus !== sourceTask.status) {
        updates.status = targetStatus
      }

      this.taskModel.updateTask(sourceTask.id, updates as Partial<TaskInternal>)
      return this.finalizeMove(sourceTask, targetStatus)
    }

    const movedTask: Task = {...sourceTask, status: targetStatus, scheduled}
    const reorderedScope: Task[] = [...orderedDestinationScope]
    reorderedScope.splice(insertAt, 0, movedTask)

    const normalized = normalizeTaskOrderIndexes(reorderedScope)

    for (const patch of normalized) {
      const existing = scopeTaskById.get(patch.id)
      if (!existing) continue

      const shouldChangeOrder = existing.orderIndex !== patch.orderIndex
      const shouldChangeStatus = patch.id === sourceTask.id && existing.status !== targetStatus
      if (!shouldChangeOrder && !shouldChangeStatus) continue

      const updates: Partial<TaskInternal> = {orderIndex: patch.orderIndex}
      if (shouldChangeStatus) {
        updates.status = targetStatus
        updates.scheduled = scheduled
      }

      this.taskModel.updateTask(existing.id, updates)
    }

    return this.finalizeMove(sourceTask, targetStatus)
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<boolean> {
    const task = this.taskModel.getTask(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const updatedTask = this.taskModel.updateTask(taskId, {branchId, milestoneId: null})
    if (!updatedTask) return false

    return true
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    const task = this.taskModel.getTask(id)
    const deleted = this.taskModel.deleteTask(id)
    if (deleted && task) this.taskEvents.record(task, "deleted")

    return deleted
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getDeletedTasks(params)
  }

  async restoreTask(id: Task["id"]): Promise<Task | null> {
    const restored = this.taskModel.restoreTask(id)
    if (restored) this.taskEvents.record(restored, "restored")

    return restored
  }

  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    return this.taskModel.permanentlyDeleteTask(id)
  }

  async permanentlyDeleteAllDeletedTasks(params?: {branchId?: Branch["id"]}): Promise<number> {
    return this.taskModel.permanentlyDeleteAllDeletedTasks(params?.branchId)
  }

  async addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    return this.taskModel.addTaskTags(taskId, tagIds)
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    return this.taskModel.removeTaskTags(taskId, tagIds)
  }

  async addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    return this.taskModel.addTaskAttachment(taskId, fileId)
  }

  async removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    return this.taskModel.removeTaskAttachment(taskId, fileId)
  }

  private finalizeMove(sourceTask: Task, targetStatus: TaskStatus): Task | null {
    const finalTask = this.taskModel.getTask(sourceTask.id)
    if (finalTask && targetStatus !== sourceTask.status) {
      this.taskEvents.recordStatusChange(finalTask, targetStatus)
    }

    return finalTask
  }
}

function resolveInsertIndex(tasks: Array<Pick<Task, "id">>, targetTaskId: Task["id"] | null, position: TaskMovePosition): number {
  if (!targetTaskId) return tasks.length

  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId)
  if (targetIndex === -1) return tasks.length

  return position === "after" ? targetIndex + 1 : targetIndex
}
