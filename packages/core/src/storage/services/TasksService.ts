import {createEntityId, NO_PROJECT_ID, planTaskCreate, planTaskMoveByOrder, planTaskUpdate} from "@daily/protocol"
import {getToday, notNullish, notUndefined} from "@daily/std"

import {TaskWorkflowError} from "../../errors/task-workflow/TaskWorkflowError"
import {TaskWorkflowErrorCode} from "../../errors/task-workflow/TaskWorkflowErrorCode"

import type {
  ActorSource,
  Branch,
  ISODate,
  ISODateTime,
  Milestone,
  MoveTaskByOrderParams,
  MutationContext,
  Tag,
  Task,
  TaskEvent,
  TaskPatch,
  TaskWritableFields,
} from "@daily/protocol"
import type {PartialDeep} from "type-fest"
import type {StorageClock, TaskInternal} from "../../types/storage"
import type {TaskModel} from "../models/TaskModel"
import type {TaskEventsService} from "./TaskEventsService"

export class TasksService {
  constructor(
    private _taskModel: TaskModel,
    private _taskEvents: TaskEventsService,
    private _clock: StorageClock = {today: getToday},
  ) {}

  async getHistoryByTask(taskId: Task["id"]): Promise<TaskEvent[]> {
    return this._taskEvents.getHistoryByTask(taskId)
  }

  /** How many times each task moved; a task never moved is left out. */
  async getMoveCounts(): Promise<Record<Task["id"], number>> {
    return this._taskEvents.getMoveCounts()
  }

  /** Every completion that fell in the half-open interval `[fromInclusive, toExclusive)`. A bound left `undefined` leaves that side unconstrained. */
  async getCompletionsBetween(fromInclusive?: ISODateTime, toExclusive?: ISODateTime): Promise<Array<{taskId: Task["id"]; at: ISODateTime}>> {
    return this._taskEvents.getCompletionsBetween(fromInclusive, toExclusive)
  }

  async getTaskList(params?: {
    from?: ISODate
    to?: ISODate
    limit?: number
    branchId?: Branch["id"]
    includeDeleted?: boolean
    includeBacklog?: boolean
  }): Promise<Task[]> {
    return this._taskModel.getTaskList(params)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this._taskModel.getTask(id)
  }

  /** Every row the update patched — always at least the named task, unless it does not exist. */
  async updateTask(id: Task["id"], updates: PartialDeep<Task>, source?: ActorSource, spentTimeDelta?: number): Promise<Task[]> {
    if (source?.kind === "agent" || source?.kind === "mcp") {
      if (
        ["status", "scheduled", "estimatedTime", "priority", "spentTime", "deletedAt"].some((key) => key in updates) ||
        spentTimeDelta !== undefined
      ) {
        throw new TaskWorkflowError(TaskWorkflowErrorCode.Forbidden, "Use the task workflow for agent stage, planning and active-time changes.")
      }
    }
    const before = this._taskModel.getTask(id)
    if (!before) return []

    const writable = {
      ...(updates as Partial<TaskWritableFields>),
      ...(spentTimeDelta !== undefined && Number.isSafeInteger(spentTimeDelta) ? {spentTime: Math.max(0, before.spentTime + spentTimeDelta)} : {}),
    }
    const milestones = this._readMilestoneScope(writable.milestoneId, [before.branchId, writable.branchId])
    const branchId = notUndefined(writable.branchId) ? writable.branchId : before.branchId

    const updated = this._applyPatches(planTaskUpdate(this._readContext(branchId, before, milestones), id, writable))

    const after = updated.find((task) => task.id === id) ?? null
    const requestedDate = writable.scheduled === null ? null : writable.scheduled?.date
    if (after) this._taskEvents.recordUpdate(before, after, source, {dateExplicit: requestedDate === (after.scheduled?.date ?? null)})

    return updated
  }

  addTaskSpentTime(id: Task["id"], seconds: number): Task | null {
    if (!Number.isSafeInteger(seconds) || seconds <= 0) return null

    const task = this._taskModel.addTaskSpentTime(id, seconds)
    if (task) this._taskEvents.record(task, "edited")
    return task
  }

  async createTask(task: Omit<Task, "id"> & {id?: Task["id"]}, source?: ActorSource): Promise<Task | null> {
    const id = task.id ?? createEntityId("task")
    const fields = planTaskCreate(this._readContext(task.branchId ?? NO_PROJECT_ID, null), task)

    const created = this._taskModel.createTask({...fields, id, tags: fields.tags.map((t) => t.id), deletedAt: task.deletedAt})
    if (created) this._taskEvents.record(created, "created", source)

    return created
  }

  /** Every row the move patched — one, or a whole renormalised column — unless the task does not exist. */
  async moveTaskByOrder(params: MoveTaskByOrderParams, source?: ActorSource, beforeApply?: (taskIds: Task["id"][]) => void): Promise<Task[]> {
    const sourceTask = this._taskModel.getTask(params.taskId)
    if (!sourceTask) return []

    const patches = planTaskMoveByOrder(this._readContext(params.acrossProjects ? null : sourceTask.branchId, sourceTask), params)
    if (source?.kind === "agent" || source?.kind === "mcp") {
      for (const patch of patches) {
        const before = this._taskModel.getTask(patch.id)
        if (
          before &&
          ((patch.status !== undefined && patch.status !== before.status) ||
            (patch.scheduled !== undefined && JSON.stringify(patch.scheduled) !== JSON.stringify(before.scheduled)))
        )
          throw new TaskWorkflowError(TaskWorkflowErrorCode.Forbidden, "Reordering cannot change agent stage or planning. Use the task workflow.")
      }
    }
    beforeApply?.(patches.map((patch) => patch.id))
    const before = this._taskModel.getTask(params.taskId) ?? sourceTask
    const updated = this._applyPatches(patches)

    return this._finalizeMove(before, updated, source)
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"], source?: ActorSource): Promise<boolean> {
    const task = this._taskModel.getTask(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const updated = await this.updateTask(taskId, {branchId}, source)
    return updated.some((item) => item.id === taskId)
  }

  async deleteTask(id: Task["id"], source?: ActorSource): Promise<boolean> {
    const task = this._taskModel.getTask(id)
    const deleted = this._taskModel.deleteTask(id)
    if (deleted && task) this._taskEvents.record(task, "deleted", source)

    return deleted
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this._taskModel.getDeletedTasks(params)
  }

  async restoreTask(id: Task["id"], source?: ActorSource): Promise<Task | null> {
    const restored = this._taskModel.restoreTask(id)
    if (restored) this._taskEvents.record(restored, "restored", source)

    return restored
  }

  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    return this._taskModel.permanentlyDeleteTask(id)
  }

  async permanentlyDeleteAllDeletedTasks(params?: {branchId?: Branch["id"]}): Promise<number> {
    return this._taskModel.permanentlyDeleteAllDeletedTasks(params?.branchId)
  }

  async addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    const before = this._taskModel.getTask(taskId)
    const after = this._taskModel.addTaskTags(taskId, tagIds)
    if (before && after) this._taskEvents.recordUpdate(before, after)
    return after
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    const before = this._taskModel.getTask(taskId)
    const after = this._taskModel.removeTaskTags(taskId, tagIds)
    if (before && after) this._taskEvents.recordUpdate(before, after)
    return after
  }

  private _finalizeMove(sourceTask: Task, updated: Task[], source?: ActorSource): Task[] {
    const finalTask = updated.find((task) => task.id === sourceTask.id) ?? null
    if (finalTask) this._taskEvents.recordUpdate(sourceTask, finalTask, source, {dateExplicit: false})

    return updated
  }

  private _readContext(branchId: Branch["id"] | null, named: Task | null, milestones: MutationContext["milestones"] = []): MutationContext {
    const scope = this._taskModel.getTaskList({...(branchId !== null && {branchId}), includeBacklog: true})
    const tasks = named && !scope.some((task) => task.id === named.id) ? [named, ...scope] : scope

    return {tasks, milestones, today: this._clock.today()}
  }

  private _readMilestoneScope(
    milestoneId: Milestone["id"] | null | undefined,
    branchIds: Array<Branch["id"] | undefined>,
  ): MutationContext["milestones"] {
    if (!milestoneId) return []

    return [...new Set(branchIds)]
      .filter((branchId): branchId is Branch["id"] => notNullish(branchId))
      .filter((branchId) => this._taskModel.milestoneBelongsToBranch(milestoneId, branchId))
      .map((branchId) => ({id: milestoneId, branchId}))
  }

  private _applyPatches(patches: TaskPatch[]): Task[] {
    const updated: Task[] = []
    for (const {id, ...fields} of patches) {
      const task = this._taskModel.updateTask(id, toTaskInternalUpdates(fields))
      if (task) updated.push(task)
    }
    return updated
  }
}

function toTaskInternalUpdates({tags, ...fields}: Partial<TaskWritableFields>): Partial<TaskInternal> {
  return notUndefined(tags) ? {...fields, tags: tags.map((tag) => tag.id)} : fields
}
