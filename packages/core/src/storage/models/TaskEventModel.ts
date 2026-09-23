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
  }): TaskEvent {
    const id = nanoid()
    const kind = input.kind ?? "manual"
    const provider = input.provider ?? null
    this.db
      .prepare(
        `INSERT INTO task_events (id, task_id, branch_id, type, event_date, from_date, to_date, created_at, kind, provider)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.taskId, input.branchId, input.type, input.eventDate, input.fromDate, input.toDate, input.createdAt, kind, provider)

    return {id, ...input, kind, provider}
  }

  /** All events for one task, newest first (both `moved` rows included). */
  getByTask(taskId: Task["id"]): TaskEvent[] {
    const rows = this.db.prepare(`SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at DESC, rowid DESC`).all(taskId) as any[]

    return rows.map(rowToTaskEvent)
  }

  /** Timestamp of the most recent `edited` event for a task, for write-side debounce. */
  getLastEditedAt(taskId: Task["id"]): ISODateTime | null {
    const row = this.db
      .prepare(`SELECT created_at FROM task_events WHERE task_id = ? AND type = 'edited' ORDER BY created_at DESC LIMIT 1`)
      .get(taskId) as {created_at: string} | undefined

    return row?.created_at ?? null
  }

  /** How many times each task moved, deduplicating the pair `recordMove` writes per move; a task never moved is left out. */
  countMovesByTask(): Record<Task["id"], number> {
    const rows = this.db
      .prepare(
        `SELECT task_id, COUNT(DISTINCT created_at || '|' || IFNULL(from_date, '') || '|' || IFNULL(to_date, '')) AS total
         FROM task_events
         WHERE type = 'moved'
         GROUP BY task_id`,
      )
      .all<{task_id: string; total: number}>()

    return Object.fromEntries(rows.map((row) => [row.task_id, row.total]))
  }

  /**
   * Every `completed` event whose instant falls in the half-open interval `[fromInclusive, toExclusive)`.
   * A bound left `undefined` leaves that side unconstrained.
   */
  listCompletionsBetween(fromInclusive?: ISODateTime, toExclusive?: ISODateTime): Array<{taskId: Task["id"]; at: ISODateTime}> {
    const conditions = ["type = 'completed'"]
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
  }
}
