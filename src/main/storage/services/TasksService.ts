import {sortTags} from "@shared/utils/tags/sortTags"
import {getOrderIndexBetween, getTaskOrderValue, normalizeTaskOrderIndexes, sortTasksByOrderIndex} from "@shared/utils/tasks/orderIndex"

import type {TagModel} from "@/storage/models/TagModel"
import type {TaskModel} from "@/storage/models/TaskModel"
import type {TaskInternal} from "@/types/storage"
import type {ISODate} from "@shared/types/common"
import type {Branch, File, MoveTaskByOrderParams, Tag, Task, TaskMovePosition} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

export class TasksService {
  constructor(
    private taskModel: TaskModel,
    private tagModel: TagModel,
  ) {}

  async getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    const [tasks, allTags] = await Promise.all([this.taskModel.getTaskList(params), this.tagModel.getTagList()])

    const tagMap = new Map(allTags.map((t) => [t.id, t]))

    return tasks.map((task) => {
      const tags = sortTags(task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[])
      return {...task, tags}
    })
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    const [task, allTags] = await Promise.all([this.taskModel.getTask(id), this.tagModel.getTagList()])
    if (!task) return null

    const tagMap = new Map(allTags.map((t) => [t.id, t]))
    const tags = sortTags(task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[])

    return {...task, tags}
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null> {
    const updatesTask: PartialDeep<TaskInternal> = {...updates} as any

    if (updates.tags !== undefined) {
      updatesTask.tags = updates.tags.map((t) => t.id)
    }

    const [task, allTags] = await Promise.all([this.taskModel.updateTask(id, updatesTask), this.tagModel.getTagList()])
    if (!task) return null

    const tagMap = new Map(allTags.map((t) => [t.id, t]))
    const tags = sortTags(task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[])

    return {...task, tags}
  }

  async createTask(task: Task): Promise<Task | null> {
    const newTask = {
      ...task,
      tags: task.tags ? task.tags.map((t) => t.id) : [],
    }

    const [createdTask, allTags] = await Promise.all([this.taskModel.createTask(newTask), this.tagModel.getTagList()])
    if (!createdTask) return null

    const tagMap = new Map(allTags.map((t) => [t.id, t]))
    const tags = createdTask.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[]

    return {...createdTask, tags}
  }

  async moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Task | null> {
    const sourceTask = await this.taskModel.getTask(params.taskId)
    if (!sourceTask) return null

    const position = params.position ?? "before"
    const targetTaskId = params.targetTaskId ?? null
    const targetStatus = params.targetStatus ?? sourceTask.status

    if (targetTaskId === sourceTask.id && targetStatus === sourceTask.status) {
      return this.getTask(sourceTask.id)
    }

    const dayTasks = await this.taskModel.getTaskList({
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
      const updates: PartialDeep<TaskInternal> = {orderIndex: nextOrderIndex}
      if (targetStatus !== sourceTask.status) {
        updates.status = targetStatus
      }

      await this.taskModel.updateTask(sourceTask.id, updates)
      return this.getTask(sourceTask.id)
    }

    const movedTask: TaskInternal = {...sourceTask, status: targetStatus}
    const reorderedScope: TaskInternal[] = [...orderedDestinationScope]
    reorderedScope.splice(insertAt, 0, movedTask)

    const normalized = normalizeTaskOrderIndexes(reorderedScope)

    for (const patch of normalized) {
      const existing = dayTaskById.get(patch.id)
      if (!existing) continue

      const shouldChangeOrder = existing.orderIndex !== patch.orderIndex
      const shouldChangeStatus = patch.id === sourceTask.id && existing.status !== targetStatus
      if (!shouldChangeOrder && !shouldChangeStatus) continue

      const updates: PartialDeep<TaskInternal> = {orderIndex: patch.orderIndex}
      if (shouldChangeStatus) {
        updates.status = targetStatus
      }

      await this.taskModel.updateTask(existing.id, updates)
    }

    return this.getTask(sourceTask.id)
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<boolean> {
    const task = await this.taskModel.getTask(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const updatedTask = await this.taskModel.updateTask(taskId, {branchId})
    if (!updatedTask) return false

    return true
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    return this.taskModel.deleteTask(id)
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    const [deletedTasks, allTags] = await Promise.all([this.taskModel.getDeletedTasks(params), this.tagModel.getTagList()])

    const tagMap = new Map(allTags.map((t) => [t.id, t]))

    return deletedTasks.map((task) => {
      const tags = sortTags(task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[])
      return {...task, tags}
    })
  }

  async restoreTask(id: Task["id"]): Promise<Task | null> {
    const [restoredTask, allTags] = await Promise.all([this.taskModel.restoreTask(id), this.tagModel.getTagList()])

    if (!restoredTask) return null

    const tagMap = new Map(allTags.map((t) => [t.id, t]))
    const tags = restoredTask.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[]

    return {...restoredTask, tags}
  }

  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    return this.taskModel.permanentlyDeleteTask(id)
  }

  async permanentlyDeleteAllDeletedTasks(params?: {branchId?: Branch["id"]}): Promise<Task["id"][]> {
    const deletedTasks = await this.taskModel.getDeletedTasks({branchId: params?.branchId})
    if (!deletedTasks.length) return []

    const deletedIds: Task["id"][] = []

    for (const task of deletedTasks) {
      const isDeleted = await this.taskModel.permanentlyDeleteTask(task.id)
      if (isDeleted) deletedIds.push(task.id)
    }

    return deletedIds
  }

  async addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const existing = new Set(task.tags)

    for (const id of tagIds) {
      existing.add(id)
    }

    const updatedTask = await this.taskModel.updateTask(taskId, {tags: Array.from(existing)})
    if (!updatedTask) return null

    return this.getTask(taskId)
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    if (!tagIds.length) return await this.getTask(taskId)

    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const newTags = task.tags.filter((id) => !tagIds.includes(id))

    if (newTags.length === task.tags.length) return this.getTask(taskId)

    const updatedTask = await this.taskModel.updateTask(taskId, {tags: newTags})
    if (!updatedTask) return null

    return this.getTask(taskId)
  }

  async addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const existing = new Set(task.attachments)

    if (!existing.has(fileId)) {
      existing.add(fileId)
      const updatedTask = await this.taskModel.updateTask(taskId, {attachments: Array.from(existing)})
      if (!updatedTask) return null
    }

    return this.getTask(taskId)
  }

  async removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const newAttachments = task.attachments.filter((id) => id !== fileId)

    if (newAttachments.length === task.attachments.length) return this.getTask(taskId)

    const updatedTask = await this.taskModel.updateTask(taskId, {attachments: newAttachments})
    if (!updatedTask) return null

    return this.getTask(taskId)
  }
}

function resolveInsertIndex(tasks: Array<Pick<TaskInternal, "id">>, targetTaskId: TaskInternal["id"] | null, position: TaskMovePosition): number {
  if (!targetTaskId) return tasks.length

  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId)
  if (targetIndex === -1) return tasks.length

  return position === "after" ? targetIndex + 1 : targetIndex
}
