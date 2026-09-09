import {DateTime} from "luxon"

import {getOrderIndexBetween, getPreviousTaskOrderIndex, getTaskOrderValue, normalizeTaskOrderIndexes, sortTasksByOrderIndex} from "@daily/protocol"
import {notNull, notUndefined} from "@daily/std"

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
  TaskSchedule,
  TaskStatus,
} from "@daily/protocol"
import type {PartialDeep} from "type-fest"
import type {TaskInternal} from "../../types/storage"
import type {TaskModel} from "../models/TaskModel"
import type {TaskEventsService} from "./TaskEventsService"

type RequestedSchedule = PartialDeep<TaskSchedule> | null | undefined

export class TasksService {
  constructor(
    private taskModel: TaskModel,
    private taskEvents: TaskEventsService,
  ) {}

  async getActivityByDay(date: ISODate, branchId: Branch["id"]): Promise<TaskEvent[]> {
    return this.taskEvents.getActivityByDay(date, branchId)
  }

  async getHistoryByTask(taskId: Task["id"]): Promise<TaskEvent[]> {
    return this.taskEvents.getHistoryByTask(taskId)
  }

  async getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getTaskList(params)
  }

  async getBacklogList(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getBacklogList(params)
  }

  async getMilestoneTasks(params: {milestoneId?: Milestone["id"]; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getMilestoneTaskList(params)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this.taskModel.getTask(id)
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>, activeDay?: ISODate): Promise<Task | null> {
    const updatesTask: PartialDeep<TaskInternal> = {...updates} as any

    if (notUndefined(updates.tags)) {
      updatesTask.tags = (updates.tags as Tag[]).map((t) => t.id)
    }

    const before = this.taskModel.getTask(id)

    if (before && (notUndefined(updates.status) || notUndefined(updates.scheduled))) {
      const resolved = this.applyScheduleInvariant(
        {status: before.status, scheduled: before.scheduled},
        {status: updates.status as TaskStatus | undefined, scheduled: updates.scheduled as RequestedSchedule},
        activeDay,
      )
      updatesTask.status = resolved.status
      updatesTask.scheduled = resolved.scheduled

      if (resolved.status === "backlog" && before.status !== "backlog" && !notUndefined(updates.orderIndex)) {
        updatesTask.orderIndex = this.topOfBacklog(before)
      }
    }

    const after = this.taskModel.updateTask(id, updatesTask as Partial<TaskInternal>)
    if (before && after) this.taskEvents.recordUpdate(before, after)

    return after
  }

  async createTask(task: Task): Promise<Task | null> {
    const isBacklog = task.status === "backlog" || task.scheduled === null
    const newTask = {
      ...task,
      status: isBacklog ? "backlog" : task.status,
      scheduled: isBacklog ? null : task.scheduled,
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
    const activeDay = params.activeDay

    if (targetTaskId === sourceTask.id && targetStatus === sourceTask.status) {
      return this.getTask(sourceTask.id)
    }

    const destinationDay = activeDay ?? sourceTask.scheduled?.date ?? this.currentDayFloor().date

    const destinationTasks =
      targetStatus === "backlog"
        ? this.taskModel.getBacklogList({branchId: sourceTask.branchId})
        : this.taskModel.getTaskList({from: destinationDay, to: destinationDay, branchId: sourceTask.branchId})

    const destinationScope = destinationTasks.filter((task) => task.status === targetStatus)
    this.placeInScope(sourceTask, destinationScope, targetTaskId, position, targetStatus)

    return this.finalizeMove(sourceTask, targetStatus, activeDay)
  }

  async moveTaskInTrash(taskId: Task["id"], targetTaskId: Task["id"] | null, position: TaskMovePosition): Promise<Task | null> {
    const task = this.taskModel.getTask(taskId)
    if (!task || targetTaskId === taskId) return task

    const trash = this.taskModel.getDeletedTasks({branchId: task.branchId})
    this.placeInScope(task, trash, targetTaskId, position)

    return this.taskModel.getTask(taskId)
  }

  async scheduleTask(taskId: Task["id"], schedule: TaskSchedule): Promise<Task | null> {
    const before = this.taskModel.getTask(taskId)
    if (!before) return null

    const updates: Partial<TaskInternal> = {scheduled: schedule}
    if (before.status === "backlog") updates.status = "active"

    const after = this.taskModel.updateTask(taskId, updates)
    if (after) this.taskEvents.recordUpdate(before, after)

    return after
  }

  async moveTaskToBacklog(taskId: Task["id"]): Promise<Task | null> {
    const before = this.taskModel.getTask(taskId)
    if (!before) return null

    const resolved = this.applyScheduleInvariant({status: before.status, scheduled: before.scheduled}, {status: "backlog"})
    const orderIndex = before.status === "backlog" ? before.orderIndex : this.topOfBacklog(before)
    const after = this.taskModel.updateTask(taskId, {status: resolved.status, scheduled: resolved.scheduled, orderIndex})
    if (after) this.taskEvents.recordUpdate(before, after)

    return after
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<boolean> {
    const task = this.taskModel.getTask(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const updatedTask = this.taskModel.updateTask(taskId, {branchId})
    if (!updatedTask) return false

    return true
  }

  async setTaskMilestone(taskId: Task["id"], milestoneId: Milestone["id"] | null): Promise<Task | null> {
    return this.taskModel.updateTask(taskId, {milestoneId})
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    const task = this.taskModel.getTask(id)
    if (task) this.taskModel.updateTask(id, {orderIndex: this.topOfTrash(task)})

    const deleted = this.taskModel.deleteTask(id)
    if (deleted && task) this.taskEvents.record(task, "deleted")

    return deleted
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getDeletedTasks(params)
  }

  async restoreTask(id: Task["id"], activeDay?: ISODate): Promise<Task | null> {
    const restored = this.taskModel.restoreTask(id)
    if (!restored) return null

    const landed = this.landOnDay(restored, activeDay)
    this.taskEvents.record(landed, "restored")

    return landed
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

  private placeInScope(task: Task, scope: Task[], targetTaskId: Task["id"] | null, position: TaskMovePosition, targetStatus?: TaskStatus): void {
    const status = targetStatus ?? task.status
    const ordered = sortTasksByOrderIndex(scope.filter((t) => t.id !== task.id))
    const insertAt = resolveInsertIndex(ordered, targetTaskId, position)

    const prevTask = ordered[insertAt - 1] ?? null
    const nextTask = ordered[insertAt] ?? null
    const orderIndex = getOrderIndexBetween(prevTask ? getTaskOrderValue(prevTask) : null, nextTask ? getTaskOrderValue(nextTask) : null)

    if (notNull(orderIndex)) {
      const updates: Partial<TaskInternal> = {orderIndex}
      if (status !== task.status) updates.status = status

      this.taskModel.updateTask(task.id, updates)
      return
    }

    const reordered: Task[] = [...ordered]
    reordered.splice(insertAt, 0, {...task, status})

    const taskById = new Map(scope.map((t) => [t.id, t]))
    taskById.set(task.id, task)

    for (const patch of normalizeTaskOrderIndexes(reordered)) {
      const existing = taskById.get(patch.id)
      if (!existing) continue

      const shouldChangeOrder = existing.orderIndex !== patch.orderIndex
      const shouldChangeStatus = patch.id === task.id && existing.status !== status
      if (!shouldChangeOrder && !shouldChangeStatus) continue

      const updates: Partial<TaskInternal> = {orderIndex: patch.orderIndex}
      if (shouldChangeStatus) updates.status = status

      this.taskModel.updateTask(existing.id, updates)
    }
  }

  private finalizeMove(sourceTask: Task, targetStatus: TaskStatus, activeDay?: ISODate): Task | null {
    if (targetStatus !== sourceTask.status) {
      const {scheduled} = this.applyScheduleInvariant({status: sourceTask.status, scheduled: sourceTask.scheduled}, {status: targetStatus}, activeDay)
      if (scheduled !== sourceTask.scheduled) {
        this.taskModel.updateTask(sourceTask.id, {scheduled})
      }
    }

    const finalTask = this.taskModel.getTask(sourceTask.id)
    if (finalTask && targetStatus !== sourceTask.status) {
      this.taskEvents.recordStatusChange(finalTask, targetStatus)
    }

    return finalTask
  }

  private landOnDay(task: Task, activeDay?: ISODate): Task {
    if (!task.scheduled || !activeDay) return task
    if (task.scheduled.date === activeDay) return task

    return this.taskModel.updateTask(task.id, {scheduled: {...task.scheduled, date: activeDay}}) ?? task
  }

  private applyScheduleInvariant(
    before: {status: TaskStatus; scheduled: TaskSchedule | null},
    requested: {status?: TaskStatus; scheduled?: RequestedSchedule},
    activeDay?: ISODate,
  ): {status: TaskStatus; scheduled: TaskSchedule | null} {
    const scheduleGiven = notUndefined(requested.scheduled)
    const givenSchedule = scheduleGiven ? (requested.scheduled as PartialDeep<TaskSchedule> | null) : null

    const status: TaskStatus =
      requested.status ?? (scheduleGiven ? (givenSchedule ? (before.status === "backlog" ? "active" : before.status) : "backlog") : before.status)

    if (status === "backlog") return {status, scheduled: null}
    if (scheduleGiven && givenSchedule) return {status, scheduled: this.completeSchedule(givenSchedule, before.scheduled)}
    if (!scheduleGiven && before.scheduled) return {status, scheduled: before.scheduled}
    return {status, scheduled: this.currentDayFloor(activeDay)}
  }

  private topOfBacklog(task: Task): number {
    const backlog = this.taskModel.getBacklogList({branchId: task.branchId}).filter((t) => t.id !== task.id)
    return getPreviousTaskOrderIndex(backlog)
  }

  private topOfTrash(task: Task): number {
    const trash = this.taskModel.getDeletedTasks({branchId: task.branchId}).filter((t) => t.id !== task.id)
    return getPreviousTaskOrderIndex(trash)
  }

  private completeSchedule(given: PartialDeep<TaskSchedule>, before: TaskSchedule | null): TaskSchedule {
    const fallback = before ?? this.currentDayFloor()

    return {
      date: given.date ?? fallback.date,
      time: given.time ?? fallback.time,
      timezone: given.timezone ?? fallback.timezone,
    }
  }

  private currentDayFloor(activeDay?: ISODate): TaskSchedule {
    const now = DateTime.now()
    return {
      date: activeDay ?? now.toISODate()!,
      time: now.toFormat("HH:mm:ss"),
      timezone: now.zoneName ?? "UTC",
    }
  }
}

function resolveInsertIndex(tasks: Array<Pick<Task, "id">>, targetTaskId: Task["id"] | null, position: TaskMovePosition): number {
  if (!targetTaskId) return tasks.length

  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId)
  if (targetIndex === -1) return tasks.length

  return position === "after" ? targetIndex + 1 : targetIndex
}
