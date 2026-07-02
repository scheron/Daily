import type {ISODate, ISODateTime} from "@shared/types/common"
import type {Branch, Task} from "@shared/types/storage"
import type Database from "better-sqlite3"

export type StatusCounts = {active: number; done: number; discarded: number}

export type DoneTaskRow = {taskId: Task["id"]; createdAt: ISODateTime | null}

export type TaskTagRow = {taskId: Task["id"]; id: string; name: string; color: string}

/**
 * Raw aggregate SQL for the stats widget. Returns rows for `StatsService` to
 * bucket by timezone; does no date math itself (kept timezone-agnostic).
 */
export class StatsModel {
  constructor(private db: Database.Database) {}

  /** Status counts for tasks scheduled within `[from, to]` (inclusive ISO dates), excluding soft-deleted. */
  getStatusCounts(from: ISODate, to: ISODate, branchId: Branch["id"]): StatusCounts {
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) AS c FROM tasks
         WHERE branch_id = ? AND deleted_at IS NULL AND scheduled_date >= ? AND scheduled_date <= ?
         GROUP BY status`,
      )
      .all(branchId, from, to) as {status: string; c: number}[]

    const counts: StatusCounts = {active: 0, done: 0, discarded: 0}
    for (const row of rows) {
      if (row.status === "active") counts.active = row.c
      else if (row.status === "done") counts.done = row.c
      else if (row.status === "discarded") counts.discarded = row.c
    }
    return counts
  }

  /**
   * For tasks scheduled within `[from, to]` (inclusive) that are currently `done`,
   * returns the instant of each task's latest `completed` event (null when none
   * was recorded). Excludes soft-deleted tasks.
   */
  getDoneTaskCompletions(from: ISODate, to: ISODate, branchId: Branch["id"]): DoneTaskRow[] {
    const rows = this.db
      .prepare(
        `SELECT t.id AS task_id,
           (SELECT te.created_at FROM task_events te WHERE te.task_id = t.id AND te.type = 'completed' ORDER BY te.created_at DESC LIMIT 1) AS created_at
         FROM tasks t
         WHERE t.branch_id = ? AND t.deleted_at IS NULL AND t.status = 'done' AND t.scheduled_date >= ? AND t.scheduled_date <= ?`,
      )
      .all(branchId, from, to) as {task_id: string; created_at: string | null}[]

    return rows.map((row) => ({taskId: row.task_id, createdAt: row.created_at}))
  }

  /** Non-deleted tags for the given task ids (one row per task/tag pair). */
  getTaskTags(taskIds: Task["id"][]): TaskTagRow[] {
    if (taskIds.length === 0) return []
    const placeholders = taskIds.map(() => "?").join(",")
    const rows = this.db
      .prepare(
        `SELECT tt.task_id, tg.id, tg.name, tg.color FROM task_tags tt
         JOIN tags tg ON tg.id = tt.tag_id AND tg.deleted_at IS NULL
         WHERE tt.task_id IN (${placeholders})`,
      )
      .all(...taskIds) as {task_id: string; id: string; name: string; color: string}[]

    return rows.map((row) => ({taskId: row.task_id, id: row.id, name: row.name, color: row.color}))
  }
}
