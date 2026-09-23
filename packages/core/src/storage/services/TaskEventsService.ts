import {resolveActorProvider} from "@daily/protocol"
import {getToday} from "@daily/std"

import type {ActorSource, ISODate, ISODateTime, Tag, Task, TaskEvent, TaskEventType, TaskStatus} from "@daily/protocol"
import type {StorageClock} from "../../types/storage"
import type {TaskEventModel} from "../models/TaskEventModel"

const EDIT_DEBOUNCE_MS = 5 * 60 * 1000

/**
 * Records and reads the activity timeline for tasks (created, moved, edited,
 * status changes, etc.). Owns all task-event logic, keeping `TasksService`
 * focused on task CRUD.
 */
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

  /** Every completion that fell in the half-open interval `[fromInclusive, toExclusive)`. A bound left `undefined` leaves that side unconstrained. */
  async getCompletionsBetween(fromInclusive?: ISODateTime, toExclusive?: ISODateTime): Promise<Array<{taskId: Task["id"]; at: ISODateTime}>> {
    return this.taskEventModel.listCompletionsBetween(fromInclusive, toExclusive)
  }

  /** Records a single event for a task, dated on the task's day, or on today when the task has none. A caller that names no `source` made it by hand. */
  record(task: Task, type: TaskEventType, source: ActorSource = {kind: "manual"}) {
    this.taskEventModel.record({
      taskId: task.id,
      branchId: task.branchId,
      type,
      eventDate: task.scheduled?.date ?? this.clock.today(),
      fromDate: null,
      toDate: null,
      createdAt: new Date().toISOString(),
      kind: source.kind,
      provider: resolveActorProvider(source),
    })
  }

  /** Records the appropriate status-change event for a task's new status. Moving into the backlog records nothing. */
  recordStatusChange(task: Task, status: TaskStatus, source?: ActorSource) {
    if (status === "backlog") return

    this.record(task, statusEventType(status), source)
  }

  /** Records the event(s) implied by a task update (status, move, or edit). */
  recordUpdate(before: Task, after: Task, source?: ActorSource) {
    if (before.status !== after.status) {
      this.recordStatusChange(after, after.status, source)
      return
    }

    if (before.scheduled && after.scheduled && before.scheduled.date !== after.scheduled.date) {
      this.recordMove(after, before.scheduled.date, after.scheduled.date, source)
    }

    if (hasNonDateEdit(before, after) && this.shouldRecordEdit(after.id)) {
      this.record(after, "edited", source)
    }
  }

  private recordMove(task: Task, fromDate: ISODate, toDate: ISODate, source: ActorSource = {kind: "manual"}) {
    const createdAt = new Date().toISOString()
    const base = {
      taskId: task.id,
      branchId: task.branchId,
      type: "moved" as const,
      fromDate,
      toDate,
      createdAt,
      kind: source.kind,
      provider: resolveActorProvider(source),
    }
    this.taskEventModel.record({...base, eventDate: fromDate})
    this.taskEventModel.record({...base, eventDate: toDate})
  }

  private shouldRecordEdit(taskId: Task["id"]): boolean {
    const lastEditedAt = this.taskEventModel.getLastEditedAt(taskId)
    if (!lastEditedAt) return true

    return Date.now() - Date.parse(lastEditedAt) >= EDIT_DEBOUNCE_MS
  }
}

/** Collapses the two `moved` rows a reschedule records (one per day) into a single row. */
function collapseMoves(events: TaskEvent[]): TaskEvent[] {
  const seenMoves = new Set<string>()
  const result: TaskEvent[] = []

  for (const event of events) {
    if (event.type === "moved") {
      const key = `${event.createdAt}|${event.fromDate}|${event.toDate}`
      if (seenMoves.has(key)) continue
      seenMoves.add(key)
    }
    result.push(event)
  }

  return result
}

function statusEventType(status: TaskStatus): TaskEventType {
  if (status === "done") return "completed"
  if (status === "discarded") return "discarded"
  return "reactivated"
}

function hasNonDateEdit(before: Task, after: Task): boolean {
  return (
    before.content !== after.content ||
    (!!before.scheduled && !!after.scheduled && before.scheduled.time !== after.scheduled.time) ||
    before.estimatedTime !== after.estimatedTime ||
    !sameTagIds(before.tags, after.tags)
  )
}

function sameTagIds(a: Tag[], b: Tag[]): boolean {
  if (a.length !== b.length) return false
  const aIds = new Set(a.map((t) => t.id))
  return b.every((t) => aIds.has(t.id))
}
