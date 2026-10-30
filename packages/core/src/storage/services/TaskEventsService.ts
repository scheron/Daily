import {nanoid} from "nanoid"

import {resolveActorProvider} from "@daily/protocol"
import {getToday} from "@daily/std"

import type {ActorSource, ISODate, ISODateTime, Tag, Task, TaskEvent, TaskEventType} from "@daily/protocol"
import type {StorageClock} from "../../types/storage"
import type {TaskEventModel} from "../models/TaskEventModel"

type EventChanges = Partial<Pick<TaskEvent, "fromStatus" | "toStatus" | "fromPriority" | "toPriority" | "fromBranchId" | "toBranchId">>

export class TaskEventsService {
  constructor(
    private taskEventModel: TaskEventModel,
    private clock: StorageClock = {today: getToday},
  ) {}

  /** Full history of one task, newest first, with the `moved` pair collapsed to one row. */
  async getHistoryByTask(taskId: Task["id"]): Promise<TaskEvent[]> {
    return collapseMoves(this.taskEventModel.getByTask(taskId))
  }

  /** How many times each task moved; a task never moved is left out. */
  async getMoveCounts(): Promise<Record<Task["id"], number>> {
    return this.taskEventModel.countMovesByTask()
  }

  /** Every completion that fell in the half-open interval `[fromInclusive, toExclusive)`. */
  async getCompletionsBetween(fromInclusive?: ISODateTime, toExclusive?: ISODateTime): Promise<Array<{taskId: Task["id"]; at: ISODateTime}>> {
    return this.taskEventModel.listCompletionsBetween(fromInclusive, toExclusive)
  }

  /** Records a lifecycle event on the task's day, or today when the task has none. */
  record(task: Task, type: TaskEventType, source?: ActorSource) {
    this.recordChange(task, type, source, {}, new Date().toISOString())
  }

  /** Records every changed category independently; only consecutive text autosaves are debounced. */
  recordUpdate(before: Task, after: Task, source?: ActorSource) {
    const createdAt = new Date().toISOString()
    const statusChanged = before.status !== after.status
    const fromDate = before.scheduled?.date ?? null
    const toDate = after.scheduled?.date ?? null
    const dateChanged = fromDate !== toDate
    const priorityChanged = before.priority !== after.priority
    const projectChanged = before.branchId !== after.branchId
    const categoryChanged = statusChanged || dateChanged || priorityChanged || projectChanged

    const contentEdited = before.content !== after.content && (categoryChanged || this.shouldRecordEdit(after.id, source))
    if (contentEdited || hasFieldEdit(before, after)) {
      this.recordChange(after, "edited", source, {}, createdAt)
    }

    if (statusChanged) {
      this.recordChange(after, "status_changed", source, {fromStatus: before.status, toStatus: after.status}, createdAt)
    }

    if (dateChanged) this.recordMove(after, fromDate, toDate, source, createdAt)

    if (priorityChanged) {
      this.recordChange(after, "priority_changed", source, {fromPriority: before.priority, toPriority: after.priority}, createdAt)
    }

    if (projectChanged) {
      this.recordChange(after, "project_changed", source, {fromBranchId: before.branchId, toBranchId: after.branchId}, createdAt)
    }
  }

  private recordChange(task: Task, type: TaskEventType, source: ActorSource = {kind: "manual"}, changes: EventChanges, createdAt: ISODateTime) {
    this.taskEventModel.record({
      taskId: task.id,
      branchId: task.branchId,
      type,
      eventDate: task.scheduled?.date ?? this.clock.today(),
      fromDate: null,
      toDate: null,
      ...changes,
      createdAt,
      kind: source.kind,
      provider: resolveActorProvider(source),
    })
  }

  private recordMove(task: Task, fromDate: ISODate | null, toDate: ISODate | null, source: ActorSource = {kind: "manual"}, createdAt: ISODateTime) {
    const base = {
      taskId: task.id,
      branchId: task.branchId,
      type: "moved" as const,
      fromDate,
      toDate,
      moveId: nanoid(),
      createdAt,
      kind: source.kind,
      provider: resolveActorProvider(source),
    }
    for (const eventDate of new Set([fromDate, toDate].filter((date): date is ISODate => date !== null))) {
      this.taskEventModel.record({...base, eventDate})
    }
  }

  private shouldRecordEdit(taskId: Task["id"], source: ActorSource = {kind: "manual"}): boolean {
    const EDIT_DEBOUNCE_MS = 5 * 60 * 1000
    const latest = this.taskEventModel.getLatestByTask(taskId)
    if (!latest || latest.type !== "edited" || latest.kind !== source.kind || latest.provider !== resolveActorProvider(source)) return true

    return Date.now() - Date.parse(latest.createdAt) >= EDIT_DEBOUNCE_MS
  }
}

function collapseMoves(events: TaskEvent[]): TaskEvent[] {
  const seenMoves = new Set<string>()
  return events.filter((event) => {
    if (event.type !== "moved") return true
    const key = event.moveId ?? `${event.createdAt}|${event.fromDate}|${event.toDate}`
    if (seenMoves.has(key)) return false
    seenMoves.add(key)
    return true
  })
}

function hasFieldEdit(before: Task, after: Task): boolean {
  const projectChanged = before.branchId !== after.branchId
  return (
    (!!before.scheduled &&
      !!after.scheduled &&
      (before.scheduled.time !== after.scheduled.time || before.scheduled.timezone !== after.scheduled.timezone)) ||
    before.estimatedTime !== after.estimatedTime ||
    before.spentTime !== after.spentTime ||
    ((!projectChanged || after.milestoneId !== null) && before.milestoneId !== after.milestoneId) ||
    ((!projectChanged || after.tags.length > 0) && !sameTagIds(before.tags, after.tags))
  )
}

function sameTagIds(a: Tag[], b: Tag[]): boolean {
  if (a.length !== b.length) return false
  const aIds = new Set(a.map((t) => t.id))
  return b.every((t) => aIds.has(t.id))
}
