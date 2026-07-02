import type {TaskEventModel} from "@/storage/models/TaskEventModel"
import type {ISODate} from "@shared/types/common"
import type {Branch, Tag, Task, TaskEvent, TaskEventType, TaskStatus} from "@shared/types/storage"

const EDIT_DEBOUNCE_MS = 5 * 60 * 1000

/**
 * Records and reads the activity timeline for tasks (created, moved, edited,
 * status changes, etc.). Owns all task-event logic, keeping `TasksService`
 * focused on task CRUD.
 */
export class TaskEventsService {
  constructor(private taskEventModel: TaskEventModel) {}

  /** Returns the activity events for a given day/branch. */
  async getActivityByDay(date: ISODate, branchId: Branch["id"]): Promise<TaskEvent[]> {
    return this.taskEventModel.getByDay(date, branchId)
  }

  /** Full history of one task, newest first, with the `moved` pair collapsed to one row. */
  async getHistoryByTask(taskId: Task["id"]): Promise<TaskEvent[]> {
    return collapseMoves(this.taskEventModel.getByTask(taskId))
  }

  /** Records a single event for a task at its scheduled date. */
  record(task: Task, type: TaskEventType) {
    this.taskEventModel.record({
      taskId: task.id,
      branchId: task.branchId,
      type,
      eventDate: task.scheduled.date,
      fromDate: null,
      toDate: null,
      createdAt: new Date().toISOString(),
    })
  }

  /** Records the appropriate status-change event for a task's new status. */
  recordStatusChange(task: Task, status: TaskStatus) {
    this.record(task, statusEventType(status))
  }

  /** Records the event(s) implied by a task update (status, move, or edit). */
  recordUpdate(before: Task, after: Task) {
    if (before.status !== after.status) {
      this.recordStatusChange(after, after.status)
      return
    }

    if (before.scheduled.date !== after.scheduled.date) {
      this.recordMove(after, before.scheduled.date, after.scheduled.date)
    }

    if (hasNonDateEdit(before, after) && this.shouldRecordEdit(after.id)) {
      this.record(after, "edited")
    }
  }

  private recordMove(task: Task, fromDate: ISODate, toDate: ISODate) {
    const createdAt = new Date().toISOString()
    const base = {
      taskId: task.id,
      branchId: task.branchId,
      type: "moved" as const,
      fromDate,
      toDate,
      createdAt,
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
    before.scheduled.time !== after.scheduled.time ||
    before.estimatedTime !== after.estimatedTime ||
    !sameTagIds(before.tags, after.tags)
  )
}

function sameTagIds(a: Tag[], b: Tag[]): boolean {
  if (a.length !== b.length) return false
  const aIds = new Set(a.map((t) => t.id))
  return b.every((t) => aIds.has(t.id))
}
