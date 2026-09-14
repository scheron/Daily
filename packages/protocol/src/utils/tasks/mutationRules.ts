import {notNull, notUndefined} from "@daily/std"

import {MAIN_BRANCH_ID} from "../../constants/storage"
import {completeScheduling, schedulingForStatus, statusForScheduling} from "./backlog"
import {getOrderIndexBetween, getPreviousTaskOrderIndex, getTaskOrderValue, normalizeTaskOrderIndexes, sortTasksByOrderIndex} from "./orderIndex"

import type {ISODate} from "../../types/common"
import type {Branch, Milestone, MoveTaskByOrderParams, Task, TaskMovePosition, TaskScheduled} from "../../types/storage"

export type TaskWritableFields = Pick<
  Task,
  | "status"
  | "scheduled"
  | "orderIndex"
  | "milestoneId"
  | "branchId"
  | "content"
  | "minimized"
  | "estimatedTime"
  | "spentTime"
  | "tags"
  | "attachments"
>

/** A complete instruction for one task. Every field present is written; absent fields are left alone. */
export type TaskPatch = {id: Task["id"]} & Partial<TaskWritableFields>

/** Everything a rule may read. The caller fills it from SQLite in main, and from the in-memory collection in the renderer. */
export type MutationContext = {
  /** Every live task the rule may consider. Filtering by branch is the rule's job, not the caller's. */
  tasks: Task[]
  milestones: Pick<Milestone, "id" | "branchId">[]
  today: ISODate
}

/** The fields a new task is created with. `id`, `createdAt`, `updatedAt` and `deletedAt` are the caller's. */
export function planTaskCreate(ctx: MutationContext, draft: Partial<TaskWritableFields>): TaskWritableFields {
  const status = draft.status as TaskWritableFields["status"]
  const branchId = draft.branchId ?? MAIN_BRANCH_ID
  const scheduled = schedulingForStatus(status, draft.scheduled ?? null, ctx.today)
  const orderIndex = status === "backlog" ? getPreviousTaskOrderIndex(backlogTasks(ctx, branchId)) : draft.orderIndex

  return {
    status,
    scheduled,
    orderIndex: orderIndex as TaskWritableFields["orderIndex"],
    milestoneId: draft.milestoneId ?? null,
    branchId,
    content: draft.content as TaskWritableFields["content"],
    minimized: draft.minimized ?? false,
    estimatedTime: draft.estimatedTime as TaskWritableFields["estimatedTime"],
    spentTime: draft.spentTime as TaskWritableFields["spentTime"],
    tags: draft.tags ?? [],
    attachments: draft.attachments ?? [],
  }
}

/** Patches for every task the update touches. Always at least the task named, unless it does not exist — then empty. */
export function planTaskUpdate(ctx: MutationContext, id: Task["id"], updates: Partial<TaskWritableFields>): TaskPatch[] {
  const before = findTask(ctx, id)
  if (!before) return []

  const patch: TaskPatch = {...definedFields(updates), id}

  if (notUndefined(updates.status) || notUndefined(updates.scheduled)) {
    const explicitStatus = updates.status
    const current = notUndefined(updates.scheduled) ? updates.scheduled : before.scheduled
    const leavesBacklog = !explicitStatus && before.status === "backlog" && notNull(current)

    const status = explicitStatus ?? (leavesBacklog ? statusForScheduling(before.status, current) : before.status)

    patch.scheduled = schedulingForStatus(status, current, ctx.today)

    if (status === "backlog" && before.status !== "backlog") {
      patch.orderIndex = getPreviousTaskOrderIndex(backlogTasks(ctx, before.branchId))
    }

    if (leavesBacklog) {
      const completed = completeScheduling(patch.scheduled as TaskScheduled)

      patch.status = status
      patch.scheduled = completed
      patch.orderIndex = getPreviousTaskOrderIndex(dayTasks(ctx, completed.date, before.branchId))
    }
  }

  const branchId = notUndefined(updates.branchId) ? updates.branchId : before.branchId
  const branchChanged = notUndefined(updates.branchId) && updates.branchId !== before.branchId

  if (notUndefined(updates.milestoneId) && updates.milestoneId !== null) {
    if (!milestoneBelongsToBranch(ctx, updates.milestoneId, branchId)) {
      patch.milestoneId = null
    }
  } else if (branchChanged && !notUndefined(updates.milestoneId)) {
    patch.milestoneId = null
  }

  return [withStoredScheduling(patch, before)]
}

/** Patches for every task the move touches — one, or a whole renormalised column. Empty when the move is a no-op. */
export function planTaskMoveByOrder(ctx: MutationContext, params: MoveTaskByOrderParams): TaskPatch[] {
  const sourceTask = findTask(ctx, params.taskId)
  if (!sourceTask) return []

  const position = params.position ?? "before"
  const targetTaskId = params.targetTaskId ?? null
  const targetStatus = params.targetStatus ?? sourceTask.status

  if (targetTaskId === sourceTask.id && targetStatus === sourceTask.status) return []

  const scheduled = schedulingForStatus(targetStatus, sourceTask.scheduled, params.activeDate)

  const scopeTasks =
    targetStatus === "backlog" ? backlogTasks(ctx, sourceTask.branchId) : dayTasks(ctx, (scheduled as TaskScheduled).date, sourceTask.branchId)

  const scopeTaskById = new Map(scopeTasks.map((task) => [task.id, task]))
  const tasksWithoutSource = scopeTasks.filter((task) => task.id !== sourceTask.id)
  const destinationScope = tasksWithoutSource.filter((task) => task.status === targetStatus)
  const orderedDestinationScope = sortTasksByOrderIndex(destinationScope)
  const insertAt = resolveInsertIndex(orderedDestinationScope, targetTaskId, position)

  const prevTask = orderedDestinationScope[insertAt - 1] ?? null
  const nextTask = orderedDestinationScope[insertAt] ?? null
  const nextOrderIndex = getOrderIndexBetween(prevTask ? getTaskOrderValue(prevTask) : null, nextTask ? getTaskOrderValue(nextTask) : null)

  if (notNull(nextOrderIndex)) {
    const patch: TaskPatch = {id: sourceTask.id, orderIndex: nextOrderIndex, scheduled}
    if (targetStatus !== sourceTask.status) {
      patch.status = targetStatus
    }

    return [patch]
  }

  const movedTask: Task = {...sourceTask, status: targetStatus, scheduled}
  const reorderedScope: Task[] = [...orderedDestinationScope]
  reorderedScope.splice(insertAt, 0, movedTask)

  const patches: TaskPatch[] = []

  for (const normalized of normalizeTaskOrderIndexes(reorderedScope)) {
    const existing = scopeTaskById.get(normalized.id)
    if (!existing) continue

    const shouldChangeOrder = existing.orderIndex !== normalized.orderIndex
    const shouldChangeStatus = normalized.id === sourceTask.id && existing.status !== targetStatus
    if (!shouldChangeOrder && !shouldChangeStatus) continue

    const patch: TaskPatch = {id: existing.id, orderIndex: normalized.orderIndex}
    if (shouldChangeStatus) {
      patch.status = targetStatus
      patch.scheduled = scheduled
    }

    patches.push(patch)
  }

  return patches
}

function findTask(ctx: MutationContext, id: Task["id"]): Task | null {
  return ctx.tasks.find((task) => task.id === id) ?? null
}

function liveTasksOf(ctx: MutationContext, branchId: Branch["id"]): Task[] {
  return ctx.tasks.filter((task) => !task.deletedAt && task.branchId === branchId)
}

function backlogTasks(ctx: MutationContext, branchId: Branch["id"]): Task[] {
  return liveTasksOf(ctx, branchId).filter((task) => task.status === "backlog")
}

function dayTasks(ctx: MutationContext, date: ISODate | undefined, branchId: Branch["id"]): Task[] {
  return liveTasksOf(ctx, branchId).filter((task) => notNull(task.scheduled) && (!notUndefined(date) || task.scheduled.date === date))
}

function milestoneBelongsToBranch(ctx: MutationContext, milestoneId: Milestone["id"], branchId: Branch["id"]): boolean {
  return ctx.milestones.some((milestone) => milestone.id === milestoneId && milestone.branchId === branchId)
}

function definedFields(updates: Partial<TaskWritableFields>): Partial<TaskWritableFields> {
  return Object.fromEntries(Object.entries(updates).filter(([, value]) => notUndefined(value))) as Partial<TaskWritableFields>
}

function withStoredScheduling(patch: TaskPatch, before: Task): TaskPatch {
  if (!patch.scheduled) return patch

  const written: Partial<TaskScheduled> = patch.scheduled
  const stored: Partial<TaskScheduled> = before.scheduled ?? {}

  return {
    ...patch,
    scheduled: {
      date: notUndefined(written.date) ? written.date : (stored.date ?? null),
      time: notUndefined(written.time) ? written.time : (stored.time ?? null),
      timezone: notUndefined(written.timezone) ? written.timezone : (stored.timezone ?? null),
    } as TaskScheduled,
  }
}

function resolveInsertIndex(tasks: Array<Pick<Task, "id">>, targetTaskId: Task["id"] | null, position: TaskMovePosition): number {
  if (!targetTaskId) return tasks.length

  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId)
  if (targetIndex === -1) return tasks.length

  return position === "after" ? targetIndex + 1 : targetIndex
}
