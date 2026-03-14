import {nanoid} from "nanoid"

import {MAIN_BRANCH_ID} from "@shared/constants/storage"
import {logger} from "@/utils/logger"

import {rowToTask} from "./_rowMappers"

import type {TaskInternal} from "@/types/storage"
import type {ID, ISODate} from "@shared/types/common"
import type {Task} from "@shared/types/storage"
import type Database from "better-sqlite3"

const TASK_SELECT = `
  SELECT
    t.id,
    t.status,
    t.content,
    t.minimized,
    t.order_index,
    t.scheduled_date,
    t.scheduled_time,
    t.scheduled_timezone,
    t.estimated_time,
    t.spent_time,
    t.branch_id,
    t.created_at,
    t.updated_at,
    t.deleted_at,
    (SELECT json_group_array(json_object(
      'id', tg.id, 'name', tg.name, 'color', tg.color,
      'createdAt', tg.created_at, 'updatedAt', tg.updated_at, 'deletedAt', tg.deleted_at
    )) FROM task_tags tt JOIN tags tg ON tt.tag_id = tg.id AND tg.deleted_at IS NULL
     WHERE tt.task_id = t.id) AS tags_json,
    (SELECT json_group_array(f.id)
     FROM task_attachments ta JOIN files f ON ta.file_id = f.id
     WHERE ta.task_id = t.id) AS attachments_json
  FROM tasks t
`

export class TaskModel {
  constructor(private db: Database.Database) {}

  getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: ID; includeDeleted?: boolean}): Task[] {
    const conditions: string[] = []
    const values: any[] = []

    if (!params?.includeDeleted) {
      conditions.push("t.deleted_at IS NULL")
    }

    if (params?.from) {
      conditions.push("t.scheduled_date >= ?")
      values.push(params.from)
    }

    if (params?.to) {
      conditions.push("t.scheduled_date <= ?")
      values.push(params.to)
    }

    if (params?.branchId) {
      if (params.branchId === MAIN_BRANCH_ID) {
        conditions.push("(t.branch_id = ? OR t.branch_id IS NULL)")
        values.push(MAIN_BRANCH_ID)
      } else {
        conditions.push("t.branch_id = ?")
        values.push(params.branchId)
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    let sql = `${TASK_SELECT} ${where} ORDER BY t.scheduled_date, t.order_index`

    if (params?.limit !== undefined && Number.isFinite(params.limit)) {
      sql += ` LIMIT ${params.limit}`
    }

    const rows = this.db.prepare(sql).all(...values) as any[]

    logger.info(logger.CONTEXT.TASKS, `Loaded ${rows.length} tasks from database`)

    return rows.map(rowToTask)
  }

  getTask(id: ID): Task | null {
    const sql = `${TASK_SELECT} WHERE t.id = ?`
    const row = this.db.prepare(sql).get(id) as any

    if (!row) {
      logger.debug(logger.CONTEXT.TASKS, `Task not found: ${id}`)
      return null
    }

    logger.debug(logger.CONTEXT.TASKS, `Returned task: ${id}`)
    return rowToTask(row)
  }

  createTask(task: Omit<TaskInternal, "id" | "createdAt" | "updatedAt">): Task | null {
    const id = nanoid()
    const now = new Date().toISOString()
    const branchId = task.branchId ?? MAIN_BRANCH_ID
    const tags = task.tags ?? []
    const attachments = task.attachments ?? []
    const orderIndex = Number.isFinite(task.orderIndex) ? task.orderIndex : Date.parse(now)

    const run = this.db.transaction(() => {
      this.db
        .prepare(
          `
        INSERT INTO tasks (
          id, status, content, minimized, order_index,
          scheduled_date, scheduled_time, scheduled_timezone,
          estimated_time, spent_time, branch_id,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          id,
          task.status,
          task.content,
          task.minimized ? 1 : 0,
          orderIndex,
          task.scheduled.date,
          task.scheduled.time,
          task.scheduled.timezone,
          task.estimatedTime,
          task.spentTime,
          branchId,
          now,
          now,
          task.deletedAt ?? null,
        )

      for (const tagId of tags) {
        this.db.prepare(`INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)`).run(id, tagId)
      }

      for (const fileId of attachments) {
        this.db.prepare(`INSERT OR IGNORE INTO task_attachments (task_id, file_id) VALUES (?, ?)`).run(id, fileId)
      }
    })

    run()

    logger.storage("Created", "TASKS", id)
    return this.getTask(id)
  }

  updateTask(id: ID, updates: Partial<TaskInternal>): Task | null {
    const now = new Date().toISOString()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.status !== undefined) {
      setClauses.push("status = ?")
      values.push(updates.status)
    }

    if (updates.content !== undefined) {
      setClauses.push("content = ?")
      values.push(updates.content)
    }

    if (updates.minimized !== undefined) {
      setClauses.push("minimized = ?")
      values.push(updates.minimized ? 1 : 0)
    }

    if (updates.orderIndex !== undefined) {
      setClauses.push("order_index = ?")
      values.push(updates.orderIndex)
    }

    if (updates.estimatedTime !== undefined) {
      setClauses.push("estimated_time = ?")
      values.push(updates.estimatedTime)
    }

    if (updates.spentTime !== undefined) {
      setClauses.push("spent_time = ?")
      values.push(updates.spentTime)
    }

    if (updates.branchId !== undefined) {
      setClauses.push("branch_id = ?")
      values.push(updates.branchId)
    }

    if (updates.deletedAt !== undefined) {
      setClauses.push("deleted_at = ?")
      values.push(updates.deletedAt)
    }

    if (updates.scheduled !== undefined) {
      if (updates.scheduled.date !== undefined) {
        setClauses.push("scheduled_date = ?")
        values.push(updates.scheduled.date)
      }
      if (updates.scheduled.time !== undefined) {
        setClauses.push("scheduled_time = ?")
        values.push(updates.scheduled.time)
      }
      if (updates.scheduled.timezone !== undefined) {
        setClauses.push("scheduled_timezone = ?")
        values.push(updates.scheduled.timezone)
      }
    }

    const run = this.db.transaction(() => {
      if (setClauses.length > 0) {
        this.db
          .prepare(
            `
          UPDATE tasks SET ${setClauses.join(", ")}, updated_at = ? WHERE id = ?
        `,
          )
          .run(...values, now, id)
      } else {
        this.db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, id)
      }

      if (updates.tags !== undefined) {
        this.db.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(id)
        for (const tagId of updates.tags) {
          this.db.prepare(`INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)`).run(id, tagId)
        }
      }

      if (updates.attachments !== undefined) {
        this.db.prepare(`DELETE FROM task_attachments WHERE task_id = ?`).run(id)
        for (const fileId of updates.attachments) {
          this.db.prepare(`INSERT OR IGNORE INTO task_attachments (task_id, file_id) VALUES (?, ?)`).run(id, fileId)
        }
      }
    })

    run()

    logger.storage("Updated", "TASKS", id)
    return this.getTask(id)
  }

  deleteTask(id: ID): boolean {
    const now = new Date().toISOString()
    const result = this.db.prepare(`UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id)

    logger.storage("Deleted", "TASKS", id)
    return result.changes > 0
  }

  getDeletedTasks(params?: {limit?: number; branchId?: ID}): Task[] {
    const conditions: string[] = ["t.deleted_at IS NOT NULL", "t.deleted_at >= '2000-01-01'"]
    const values: any[] = []

    if (params?.branchId) {
      if (params.branchId === MAIN_BRANCH_ID) {
        conditions.push("(t.branch_id = ? OR t.branch_id IS NULL)")
        values.push(MAIN_BRANCH_ID)
      } else {
        conditions.push("t.branch_id = ?")
        values.push(params.branchId)
      }
    }

    const where = `WHERE ${conditions.join(" AND ")}`
    let sql = `${TASK_SELECT} ${where} ORDER BY t.deleted_at DESC`

    if (params?.limit !== undefined && Number.isFinite(params.limit)) {
      sql += ` LIMIT ${params.limit}`
    }

    const rows = this.db.prepare(sql).all(...values) as any[]

    logger.info(logger.CONTEXT.TASKS, `Loaded ${rows.length} deleted tasks from database`)

    return rows.map(rowToTask)
  }

  restoreTask(id: ID): Task | null {
    const now = new Date().toISOString()
    this.db.prepare(`UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?`).run(now, id)

    logger.storage("Restored", "TASKS", id)
    return this.getTask(id)
  }

  permanentlyDeleteTask(id: ID): boolean {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `
      UPDATE tasks SET deleted_at = '1970-01-01T00:00:00.000Z', updated_at = ? WHERE id = ?
    `,
      )
      .run(now, id)

    logger.storage("Permanently Deleted", "TASKS", id)
    return result.changes > 0
  }

  permanentlyDeleteAllDeletedTasks(branchId?: ID): number {
    const now = new Date().toISOString()
    let result

    if (branchId) {
      if (branchId === MAIN_BRANCH_ID) {
        result = this.db
          .prepare(
            `
          UPDATE tasks SET deleted_at = '1970-01-01T00:00:00.000Z', updated_at = ?
          WHERE deleted_at IS NOT NULL AND deleted_at >= '2000-01-01'
          AND (branch_id = ? OR branch_id IS NULL)
        `,
          )
          .run(now, branchId)
      } else {
        result = this.db
          .prepare(
            `
          UPDATE tasks SET deleted_at = '1970-01-01T00:00:00.000Z', updated_at = ?
          WHERE deleted_at IS NOT NULL AND deleted_at >= '2000-01-01'
          AND branch_id = ?
        `,
          )
          .run(now, branchId)
      }
    } else {
      result = this.db
        .prepare(
          `
        UPDATE tasks SET deleted_at = '1970-01-01T00:00:00.000Z', updated_at = ?
        WHERE deleted_at IS NOT NULL AND deleted_at >= '2000-01-01'
      `,
        )
        .run(now)
    }

    logger.info(logger.CONTEXT.TASKS, `Permanently deleted ${result.changes} tasks`)
    return result.changes
  }

  addTaskTags(taskId: ID, tagIds: ID[]): Task | null {
    for (const tagId of tagIds) {
      this.db.prepare(`INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)`).run(taskId, tagId)
    }

    logger.debug(logger.CONTEXT.TASKS, `Added ${tagIds.length} tags to task ${taskId}`)
    return this.getTask(taskId)
  }

  removeTaskTags(taskId: ID, tagIds: ID[]): Task | null {
    for (const tagId of tagIds) {
      this.db.prepare(`DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?`).run(taskId, tagId)
    }

    logger.debug(logger.CONTEXT.TASKS, `Removed ${tagIds.length} tags from task ${taskId}`)
    return this.getTask(taskId)
  }

  addTaskAttachment(taskId: ID, fileId: ID): Task | null {
    this.db.prepare(`INSERT OR IGNORE INTO task_attachments (task_id, file_id) VALUES (?, ?)`).run(taskId, fileId)

    logger.debug(logger.CONTEXT.TASKS, `Added attachment ${fileId} to task ${taskId}`)
    return this.getTask(taskId)
  }

  removeTaskAttachment(taskId: ID, fileId: ID): Task | null {
    this.db.prepare(`DELETE FROM task_attachments WHERE task_id = ? AND file_id = ?`).run(taskId, fileId)

    logger.debug(logger.CONTEXT.TASKS, `Removed attachment ${fileId} from task ${taskId}`)
    return this.getTask(taskId)
  }
}
