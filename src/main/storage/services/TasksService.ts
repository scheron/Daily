import {getOrderIndexBetween, getTaskOrderValue, normalizeTaskOrderIndexes, sortTasksByOrderIndex} from "@shared/utils/tasks/orderIndex"

import type {TaskModel} from "@/storage/models/TaskModel"
import type {TaskInternal} from "@/types/storage"
import type {ISODate} from "@shared/types/common"
import type {Branch, File, MoveTaskByOrderParams, Tag, Task, TaskMovePosition} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

export class TasksService {
  constructor(private taskModel: TaskModel) {}

  async getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getTaskList(params)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this.taskModel.getTask(id)
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null> {
    const updatesTask: PartialDeep<TaskInternal> = {...updates} as any

    if (updates.tags !== undefined) {
      updatesTask.tags = (updates.tags as Tag[]).map((t) => t.id)
    }

    return this.taskModel.updateTask(id, updatesTask as Partial<TaskInternal>)
  }

  async createTask(task: Task): Promise<Task | null> {
    const newTask = {
      ...task,
      tags: task.tags ? task.tags.map((t) => t.id) : [],
    } as Omit<TaskInternal, "id" | "createdAt" | "updatedAt">

    return this.taskModel.createTask(newTask)
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

    const dayTasks = this.taskModel.getTaskList({
      from: sourceTask.scheduled.date,
      to: sourceTask.scheduled.date,
      branchId: sourceTask.branchId,
    })

    const dayTaskById = new Map(dayTasks.map((task) => [task.id, task]))
    const tasksWithoutSource = dayTasks.filter((task) => task.id !== sourceTask.id)
    const destinationScope = params.mode === "column" ? tasksWithoutSource.filter((task) => task.status === targetStatus) : tasksWithoutSource
    const orderedDestinationScope = sortTasksByOrderIndex(destinationScope)
    const insertAt = resolveInsertIndex(orderedDestinationScope, targetTaskId, position)

    const prevTask = orderedDestinationScope[insertAt - 1] ?? null
    const nextTask = orderedDestinationScope[insertAt] ?? null
    const nextOrderIndex = getOrderIndexBetween(prevTask ? getTaskOrderValue(prevTask) : null, nextTask ? getTaskOrderValue(nextTask) : null)

    if (nextOrderIndex !== null) {
      const updates: Partial<TaskInternal> = {orderIndex: nextOrderIndex}
      if (targetStatus !== sourceTask.status) {
        updates.status = targetStatus
      }

      this.taskModel.updateTask(sourceTask.id, updates as Partial<TaskInternal>)
      return this.getTask(sourceTask.id)
    }

    const movedTask: Task = {...sourceTask, status: targetStatus}
    const reorderedScope: Task[] = [...orderedDestinationScope]
    reorderedScope.splice(insertAt, 0, movedTask)

    const normalized = normalizeTaskOrderIndexes(reorderedScope)

    for (const patch of normalized) {
      const existing = dayTaskById.get(patch.id)
      if (!existing) continue

      const shouldChangeOrder = existing.orderIndex !== patch.orderIndex
      const shouldChangeStatus = patch.id === sourceTask.id && existing.status !== targetStatus
      if (!shouldChangeOrder && !shouldChangeStatus) continue

      const updates: Partial<TaskInternal> = {orderIndex: patch.orderIndex}
      if (shouldChangeStatus) {
        updates.status = targetStatus
      }

      this.taskModel.updateTask(existing.id, updates)
    }

    return this.getTask(sourceTask.id)
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<boolean> {
    const task = this.taskModel.getTask(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const updatedTask = this.taskModel.updateTask(taskId, {branchId})
    if (!updatedTask) return false

    return true
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    return this.taskModel.deleteTask(id)
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getDeletedTasks(params)
  }

  async restoreTask(id: Task["id"]): Promise<Task | null> {
    return this.taskModel.restoreTask(id)
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
}

function resolveInsertIndex(tasks: Array<Pick<Task, "id">>, targetTaskId: Task["id"] | null, position: TaskMovePosition): number {
  if (!targetTaskId) return tasks.length

  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId)
  if (targetIndex === -1) return tasks.length

  return position === "after" ? targetIndex + 1 : targetIndex
}
