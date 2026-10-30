import {nanoid} from "nanoid"

import type {ActorKind, Branch, ISODate, ISODateTime, Task, TaskEvent, TaskEventType} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"

export class TaskEventModel {
  constructor(private db: SqliteDriver) {}

  /** Append an immutable activity event. A caller that names no `kind`/`provider` made it by hand. */
  record(input: {
    taskId: Task["id"]
    branchId: Branch["id"]
    type: TaskEventType
    eventDate: ISODate
    fromDate: ISODate | null
    toDate: ISODate | null
    createdAt: ISODateTime
    kind?: ActorKind
    provider?: string | null
    fromStatus?: TaskEvent["fromStatus"]
    toStatus?: TaskEvent["toStatus"]
    fromPriority?: TaskEvent["fromPriority"]
    toPriority?: TaskEvent["toPriority"]
    fromBranchId?: TaskEvent["fromBranchId"]
    toBranchId?: TaskEvent["toBranchId"]
    moveId?: string | null
  }): TaskEvent {
    const id = nanoid()
    const kind = input.kind ?? "manual"
    const provider = input.provider ?? null
    const metadata = {
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      fromPriority: input.fromPriority ?? null,
      toPriority: input.toPriority ?? null,
      fromBranchId: input.fromBranchId ?? null,
      toBranchId: input.toBranchId ?? null,
      sequence: this.nextSequence(input.taskId, input.createdAt),
      moveId: input.moveId ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO task_events (id, task_id, branch_id, type, event_date, from_date, to_date, created_at, kind, provider,
          from_status, to_status, from_priority, to_priority, from_branch_id, to_branch_id, sequence, move_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.taskId,
        input.branchId,
        input.type,
        input.eventDate,
        input.fromDate,
        input.toDate,
        input.createdAt,
        kind,
        provider,
        metadata.fromStatus,
        metadata.toStatus,
        metadata.fromPriority,
        metadata.toPriority,
        metadata.fromBranchId,
        metadata.toBranchId,
        metadata.sequence,
        metadata.moveId,
      )

    return {id, ...input, kind, provider, ...metadata}
  }

  /** All events for one task, newest first (both `moved` rows included). */
  getByTask(taskId: Task["id"]): TaskEvent[] {
    const rows = this.db.prepare(`SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at DESC, sequence DESC, id DESC`).all(taskId) as any[]

    return rows.map(rowToTaskEvent)
  }

  getLatestByTask(taskId: Task["id"]): TaskEvent | null {
    const row = this.db.prepare("SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at DESC, sequence DESC, id DESC LIMIT 1").get(taskId)

    return row ? rowToTaskEvent(row) : null
  }

  /** How many times each task moved, deduplicating the pair `recordMove` writes per move; a task never moved is left out. */
  countMovesByTask(): Record<Task["id"], number> {
    const rows = this.db
      .prepare(
        `SELECT task_id, COUNT(DISTINCT CASE WHEN move_id IS NOT NULL THEN 'move:' || move_id
           ELSE 'legacy:' || created_at || '|' || IFNULL(from_date, '') || '|' || IFNULL(to_date, '') END) AS total
         FROM task_events
         WHERE type = 'moved'
         GROUP BY task_id`,
      )
      .all<{task_id: string; total: number}>()

    return Object.fromEntries(rows.map((row) => [row.task_id, row.total]))
  }

  /**
   * Every completion whose instant falls in the half-open interval `[fromInclusive, toExclusive)`.
   * A bound left `undefined` leaves that side unconstrained.
   */
  listCompletionsBetween(fromInclusive?: ISODateTime, toExclusive?: ISODateTime): Array<{taskId: Task["id"]; at: ISODateTime}> {
    const conditions = ["(type = 'completed' OR (type = 'status_changed' AND to_status = 'done'))"]
    const params: ISODateTime[] = []

    if (fromInclusive !== undefined) {
      conditions.push("created_at >= ?")
      params.push(fromInclusive)
    }
    if (toExclusive !== undefined) {
      conditions.push("created_at < ?")
      params.push(toExclusive)
    }

    const rows = this.db
      .prepare(`SELECT task_id, created_at FROM task_events WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC`)
      .all<{task_id: string; created_at: string}>(...params)

    return rows.map((row) => ({taskId: row.task_id, at: row.created_at}))
  }

  private nextSequence(taskId: Task["id"], createdAt: ISODateTime): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM task_events WHERE task_id = ? AND created_at = ?")
      .get<{next: number}>(taskId, createdAt)

    return row?.next ?? 1
  }
}

function rowToTaskEvent(row: any): TaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    branchId: row.branch_id,
    type: row.type,
    eventDate: row.event_date,
    fromDate: row.from_date ?? null,
    toDate: row.to_date ?? null,
    createdAt: row.created_at,
    kind: row.kind ?? "manual",
    provider: row.provider ?? null,
    fromStatus: row.from_status ?? null,
    toStatus: row.to_status ?? null,
    fromPriority: row.from_priority ?? null,
    toPriority: row.to_priority ?? null,
    fromBranchId: row.from_branch_id ?? null,
    toBranchId: row.to_branch_id ?? null,
    sequence: row.sequence ?? 0,
    moveId: row.move_id ?? null,
  }
}
