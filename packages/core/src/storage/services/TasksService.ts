import {createEntityId, MAIN_BRANCH_ID, planTaskCreate, planTaskMoveByOrder, planTaskUpdate} from "@daily/protocol"
import {getToday, notNullish, notUndefined} from "@daily/std"

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
  TaskStatus,
  TaskWritableFields,
} from "@daily/protocol"
import type {PartialDeep} from "type-fest"
import type {StorageClock, TaskInternal} from "../../types/storage"
import type {TaskModel} from "../models/TaskModel"
import type {TaskEventsService} from "./TaskEventsService"

export class TasksService {
  constructor(
    private taskModel: TaskModel,
    private taskEvents: TaskEventsService,
    private clock: StorageClock = {today: getToday},
  ) {}

  async getHistoryByTask(taskId: Task["id"]): Promise<TaskEvent[]> {
    return this.taskEvents.getHistoryByTask(taskId)
  }

  /** How many times each task moved; a task never moved is left out. */
  async getMoveCounts(): Promise<Record<Task["id"], number>> {
    return this.taskEvents.getMoveCounts()
  }

  /** Every completion that fell in the half-open interval `[fromInclusive, toExclusive)`. A bound left `undefined` leaves that side unconstrained. */
  async getCompletionsBetween(fromInclusive?: ISODateTime, toExclusive?: ISODateTime): Promise<Array<{taskId: Task["id"]; at: ISODateTime}>> {
    return this.taskEvents.getCompletionsBetween(fromInclusive, toExclusive)
  }

  async getTaskList(params?: {
    from?: ISODate
    to?: ISODate
    limit?: number
    branchId?: Branch["id"]
    includeDeleted?: boolean
    includeBacklog?: boolean
  }): Promise<Task[]> {
    return this.taskModel.getTaskList(params)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this.taskModel.getTask(id)
  }

  /** Every row the update patched — always at least the named task, unless it does not exist. */
  async updateTask(id: Task["id"], updates: PartialDeep<Task>, source?: ActorSource): Promise<Task[]> {
    const before = this.taskModel.getTask(id)
    if (!before) return []

    const writable = updates as Partial<TaskWritableFields>
    const milestones = this.readMilestoneScope(writable.milestoneId, [before.branchId, writable.branchId])

    const updated = this.applyPatches(planTaskUpdate(this.readContext(before.branchId, before, milestones), id, writable))

    const after = updated.find((task) => task.id === id) ?? null
    if (after) this.taskEvents.recordUpdate(before, after, source)

    return updated
  }

  async createTask(task: Omit<Task, "id"> & {id?: Task["id"]}, source?: ActorSource): Promise<Task | null> {
    const id = task.id ?? createEntityId("task")
    const fields = planTaskCreate(this.readContext(task.branchId ?? MAIN_BRANCH_ID, null), task)

    const created = this.taskModel.createTask({...fields, id, tags: fields.tags.map((t) => t.id), deletedAt: task.deletedAt})
    if (created) this.taskEvents.record(created, "created", source)

    return created
  }

  /** Every row the move patched — one, or a whole renormalised column — unless the task does not exist. */
  async moveTaskByOrder(params: MoveTaskByOrderParams, source?: ActorSource): Promise<Task[]> {
    const sourceTask = this.taskModel.getTask(params.taskId)
    if (!sourceTask) return []

    const updated = this.applyPatches(planTaskMoveByOrder(this.readContext(sourceTask.branchId, sourceTask), params))

    return this.finalizeMove(sourceTask, params.targetStatus ?? sourceTask.status, updated, source)
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<boolean> {
    const task = this.taskModel.getTask(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const updatedTask = this.taskModel.updateTask(taskId, {branchId, milestoneId: null})
    if (!updatedTask) return false

    return true
  }

  async deleteTask(id: Task["id"], source?: ActorSource): Promise<boolean> {
    const task = this.taskModel.getTask(id)
    const deleted = this.taskModel.deleteTask(id)
    if (deleted && task) this.taskEvents.record(task, "deleted", source)

    return deleted
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.taskModel.getDeletedTasks(params)
  }

  async restoreTask(id: Task["id"], source?: ActorSource): Promise<Task | null> {
    const restored = this.taskModel.restoreTask(id)
    if (restored) this.taskEvents.record(restored, "restored", source)

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

  private finalizeMove(sourceTask: Task, targetStatus: TaskStatus, updated: Task[], source?: ActorSource): Task[] {
    const finalTask = updated.find((task) => task.id === sourceTask.id) ?? null
    if (finalTask && targetStatus !== sourceTask.status) {
      this.taskEvents.recordStatusChange(finalTask, targetStatus, source)
    }

    return updated
  }

  /** The project's live tasks, plus the named task even when it is soft-deleted, since the rule looks it up by id. */
  private readContext(branchId: Branch["id"], named: Task | null, milestones: MutationContext["milestones"] = []): MutationContext {
    const scope = this.taskModel.getTaskList({branchId, includeBacklog: true})
    const tasks = named && !scope.some((task) => task.id === named.id) ? [named, ...scope] : scope

    return {tasks, milestones, today: this.clock.today()}
  }

  private readMilestoneScope(
    milestoneId: Milestone["id"] | null | undefined,
    branchIds: Array<Branch["id"] | undefined>,
  ): MutationContext["milestones"] {
    if (!milestoneId) return []

    return [...new Set(branchIds)]
      .filter((branchId): branchId is Branch["id"] => notNullish(branchId))
      .filter((branchId) => this.taskModel.milestoneBelongsToBranch(milestoneId, branchId))
      .map((branchId) => ({id: milestoneId, branchId}))
  }

  /** Applies every patch and returns the row `taskModel.updateTask` handed back for each — nothing is read back afterward to find them. */
  private applyPatches(patches: TaskPatch[]): Task[] {
    const updated: Task[] = []
    for (const {id, ...fields} of patches) {
      const task = this.taskModel.updateTask(id, toTaskInternalUpdates(fields))
      if (task) updated.push(task)
    }
    return updated
  }
}

function toTaskInternalUpdates({tags, ...fields}: Partial<TaskWritableFields>): Partial<TaskInternal> {
  return notUndefined(tags) ? {...fields, tags: tags.map((tag) => tag.id)} : fields
}
