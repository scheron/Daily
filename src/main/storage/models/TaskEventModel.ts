import {nanoid} from "nanoid"

import type {ISODate, ISODateTime} from "@shared/types/common"
import type {Branch, Task, TaskEvent, TaskEventType} from "@shared/types/storage"
import type Database from "better-sqlite3"

export class TaskEventModel {
  constructor(private db: Database.Database) {}

  /** Append an immutable activity event. */
  record(input: {
    taskId: Task["id"]
    branchId: Branch["id"]
    type: TaskEventType
    eventDate: ISODate
    fromDate: ISODate | null
    toDate: ISODate | null
    createdAt: ISODateTime
  }): TaskEvent {
    const id = nanoid()
    this.db
      .prepare(
        `INSERT INTO task_events (id, task_id, branch_id, type, event_date, from_date, to_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.taskId, input.branchId, input.type, input.eventDate, input.fromDate, input.toDate, input.createdAt)

    return {id, ...input}
  }

  /**
   * Events for one branch on one local calendar date, newest first.
   * Events whose task is soft-deleted are omitted, except the `deleted` event itself,
   * so a removed task leaves only its deletion marker and no openable history.
   */
  getByDay(date: ISODate, branchId: Branch["id"]): TaskEvent[] {
    const rows = this.db
      .prepare(
        `SELECT te.* FROM task_events te
         LEFT JOIN tasks t ON t.id = te.task_id
         WHERE te.branch_id = ? AND te.event_date = ?
           AND (t.deleted_at IS NULL OR te.type = 'deleted')
         ORDER BY te.created_at DESC, te.rowid DESC`,
      )
      .all(branchId, date) as any[]

    return rows.map(rowToTaskEvent)
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
  }
}
