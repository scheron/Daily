import {createEntityId} from "@daily/protocol"

import {rowToSubtask} from "./_rowMappers"

import type {Subtask, SubtaskCounts, Task} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"
import type {SubtaskRow} from "./_rowMappers"

const SUBTASK_SELECT = `
  SELECT id, task_id, content, done, order_key, created_at, updated_at, deleted_at
  FROM subtasks
`

const PERMANENT_DELETE_AT = "1970-01-01T00:00:00.000Z"

export class SubtaskModel {
  constructor(private db: SqliteDriver) {}

  /** One task's live subtasks in their order. `id` breaks a tie between two devices that picked the same key. */
  getByTask(taskId: Task["id"]): Subtask[] {
    const rows = this.db.prepare(`${SUBTASK_SELECT} WHERE task_id = ? AND deleted_at IS NULL ORDER BY order_key ASC, id ASC`).all<SubtaskRow>(taskId)

    return rows.map(rowToSubtask)
  }

  /** How many live subtasks each task carries and how many are checked. Only tasks that have some are counted. */
  countByTask(): SubtaskCounts {
    const rows = this.db
      .prepare(`SELECT task_id, COUNT(*) AS total, SUM(done) AS done FROM subtasks WHERE deleted_at IS NULL GROUP BY task_id`)
      .all<{task_id: string; total: number; done: number}>()

    return Object.fromEntries(rows.map((row) => [row.task_id, {done: row.done, total: row.total}]))
  }

  getSubtask(id: Subtask["id"]): Subtask | null {
    const row = this.db.prepare(`${SUBTASK_SELECT} WHERE id = ?`).get<SubtaskRow>(id)
    if (!row) return null

    return rowToSubtask(row)
  }

  createSubtask(input: {taskId: Task["id"]; content: string; orderKey: string}): Subtask {
    const id = createEntityId("subtask")
    const now = new Date().toISOString()

    this.db
      .prepare(`INSERT INTO subtasks (id, task_id, content, done, order_key, created_at, updated_at, deleted_at) VALUES (?, ?, ?, 0, ?, ?, ?, NULL)`)
      .run(id, input.taskId, input.content, input.orderKey, now, now)

    return {id, ...input, done: false, createdAt: now, updatedAt: now, deletedAt: null}
  }

  /** Rewrites a live subtask's markdown and mark, whichever are given. Null when no live subtask carries that id. */
  updateSubtask(id: Subtask["id"], updates: {content?: string; done?: boolean}): Subtask | null {
    const current = this.getSubtask(id)
    if (!current || current.deletedAt !== null) return null

    const now = new Date().toISOString()
    this.db
      .prepare(`UPDATE subtasks SET content = ?, done = ?, updated_at = ? WHERE id = ?`)
      .run(updates.content ?? current.content, (updates.done ?? current.done) ? 1 : 0, now, id)

    return this.getSubtask(id)
  }

  /** Soft-deletes a live subtask. Null when no live subtask carries that id. */
  deleteSubtask(id: Subtask["id"]): Subtask["id"] | null {
    const now = new Date().toISOString()
    const touched = this.db
      .prepare(`UPDATE subtasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id`)
      .all<{id: string}>(now, now, id)

    return touched.length ? id : null
  }

  /** Every subtask text, soft-deleted ones included, so the orphan-file collector keeps the images any stored subtask still references. */
  getAllContents(): string[] {
    return this.db
      .prepare(`SELECT content FROM subtasks`)
      .all<{content: string}>()
      .map((row) => row.content)
  }

  /** Backdates the subtasks of permanently deleted tasks so they expire with their tasks. */
  permanentlyDeleteSubtasksOfTasks(taskIds: Task["id"][]): Subtask["id"][] {
    if (taskIds.length === 0) return []

    const now = new Date().toISOString()
    const placeholders = taskIds.map(() => "?").join(", ")
    const touched = this.db
      .prepare(
        `UPDATE subtasks SET deleted_at = ?, updated_at = ?
         WHERE task_id IN (${placeholders}) AND (deleted_at IS NULL OR deleted_at > ?)
         RETURNING id`,
      )
      .all<{id: string}>(PERMANENT_DELETE_AT, now, ...taskIds, PERMANENT_DELETE_AT)

    return touched.map((row) => row.id)
  }
}
