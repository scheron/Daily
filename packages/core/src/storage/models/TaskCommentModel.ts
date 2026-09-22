import {nanoid} from "nanoid"

import {rowToTaskComment} from "./_rowMappers"

import type {Branch, Task, TaskComment, TaskCommentOrigin} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"
import type {TaskCommentRow} from "./_rowMappers"

const TASK_COMMENT_SELECT = `
  SELECT id, task_id, branch_id, content, origin, created_at, updated_at, deleted_at
  FROM task_comments
`

/** The epoch `deleted_at` a permanent delete writes, so the next sync merge garbage-collects the row instead of carrying it. */
const PERMANENT_DELETE_AT = "1970-01-01T00:00:00.000Z"

export class TaskCommentModel {
  constructor(private db: SqliteDriver) {}

  /**
   * One task's live comments, oldest first. `rowid` breaks a tie rather than `id`, so comments
   * written in the same millisecond — a batch from an agent, say — keep the order they were written
   * in instead of the arbitrary order of their nanoids. `TaskEventModel` orders its rows the same way.
   */
  getByTask(taskId: Task["id"]): TaskComment[] {
    const rows = this.db
      .prepare(`${TASK_COMMENT_SELECT} WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at ASC, rowid ASC`)
      .all<TaskCommentRow>(taskId)

    return rows.map(rowToTaskComment)
  }

  getComment(id: TaskComment["id"]): TaskComment | null {
    const row = this.db.prepare(`${TASK_COMMENT_SELECT} WHERE id = ?`).get<TaskCommentRow>(id)
    if (!row) return null

    return rowToTaskComment(row)
  }

  createComment(input: {taskId: Task["id"]; branchId: Branch["id"]; content: string; origin: TaskCommentOrigin | null}): TaskComment {
    const id = nanoid()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO task_comments (id, task_id, branch_id, content, origin, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, input.taskId, input.branchId, input.content, input.origin, now, now)

    return {id, ...input, createdAt: now, updatedAt: now, deletedAt: null}
  }

  /** Rewrites a live comment's markdown. Null when no live comment carries that id. */
  updateComment(id: TaskComment["id"], content: string): TaskComment | null {
    const now = new Date().toISOString()
    const touched = this.db
      .prepare(`UPDATE task_comments SET content = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id`)
      .all<{id: string}>(content, now, id)

    if (!touched.length) return null

    return this.getComment(id)
  }

  /** Soft-deletes a live comment. Null when no live comment carries that id. */
  deleteComment(id: TaskComment["id"]): TaskComment["id"] | null {
    const now = new Date().toISOString()
    const touched = this.db
      .prepare(`UPDATE task_comments SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id`)
      .all<{id: string}>(now, now, id)

    return touched.length ? id : null
  }

  /** Points a task's comments at the project the task now sits in; returns the comments that moved. */
  moveCommentsToBranch(taskId: Task["id"], branchId: Branch["id"]): TaskComment[] {
    const now = new Date().toISOString()
    const touched = this.db
      .prepare(`UPDATE task_comments SET branch_id = ?, updated_at = ? WHERE task_id = ? AND branch_id != ? AND deleted_at IS NULL RETURNING id`)
      .all<{id: string}>(branchId, now, taskId, branchId)

    return touched.map((row) => this.getComment(row.id)).filter((comment): comment is TaskComment => comment !== null)
  }

  /**
   * Backdates the comments of permanently deleted tasks so they expire with their tasks.
   * Tasks are permanently deleted the same way — nothing in this project is hard-deleted outside sync GC.
   */
  permanentlyDeleteCommentsOfTasks(taskIds: Task["id"][]): TaskComment["id"][] {
    if (taskIds.length === 0) return []

    const now = new Date().toISOString()
    const placeholders = taskIds.map(() => "?").join(", ")
    const touched = this.db
      .prepare(
        `UPDATE task_comments SET deleted_at = ?, updated_at = ?
         WHERE task_id IN (${placeholders}) AND (deleted_at IS NULL OR deleted_at > ?)
         RETURNING id`,
      )
      .all<{id: string}>(PERMANENT_DELETE_AT, now, ...taskIds, PERMANENT_DELETE_AT)

    return touched.map((row) => row.id)
  }
}
