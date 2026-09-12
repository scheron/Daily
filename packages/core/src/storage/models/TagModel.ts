import {nanoid} from "nanoid"

import {MAIN_BRANCH_ID} from "@daily/protocol"
import {notUndefined} from "@daily/std"

import {logger} from "../../utils/logger"
import {rowToTag} from "./_rowMappers"

import type {Branch, Tag} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"

export class TagModel {
  constructor(private db: SqliteDriver) {}

  getTagList(params?: {branchId?: Branch["id"]; includeDeleted?: boolean}): Tag[] {
    const conditions: string[] = []
    const values: any[] = []

    if (!params?.includeDeleted) {
      conditions.push("deleted_at IS NULL")
    }

    if (params?.branchId) {
      if (params.branchId === MAIN_BRANCH_ID) {
        conditions.push("(branch_id = ? OR branch_id IS NULL)")
        values.push(MAIN_BRANCH_ID)
      } else {
        conditions.push("branch_id = ?")
        values.push(params.branchId)
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const sql = `SELECT id, branch_id, name, color, created_at, updated_at, deleted_at FROM tags ${where} ORDER BY name COLLATE NOCASE`

    const rows = this.db.prepare(sql).all(...values) as any[]

    logger.info(logger.CONTEXT.TAGS, `Loaded ${rows.length} tags from database`)

    return rows.map(rowToTag)
  }

  getTag(id: Tag["id"]): Tag | null {
    const row = this.db
      .prepare(
        `
      SELECT id, branch_id, name, color, created_at, updated_at, deleted_at FROM tags WHERE id = ?
    `,
      )
      .get(id) as any

    if (!row) {
      logger.debug(logger.CONTEXT.TAGS, `Tag not found: ${id}`)
      return null
    }

    return rowToTag(row)
  }

  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Tag | null {
    const id = nanoid()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
      INSERT INTO tags (id, branch_id, name, color, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, tag.branchId, tag.name, tag.color, now, now, tag.deletedAt ?? null)

    logger.storage("Created", "TAGS", id)
    return this.getTag(id)
  }

  updateTag(id: Tag["id"], updates: Partial<Pick<Tag, "color" | "name">>): Tag | null {
    const now = new Date().toISOString()
    const setClauses: string[] = []
    const values: any[] = []

    if (notUndefined(updates.name)) {
      setClauses.push("name = ?")
      values.push(updates.name)
    }

    if (notUndefined(updates.color)) {
      setClauses.push("color = ?")
      values.push(updates.color)
    }

    if (setClauses.length > 0) {
      this.db
        .prepare(
          `
        UPDATE tags SET ${setClauses.join(", ")}, updated_at = ? WHERE id = ?
      `,
        )
        .run(...values, now, id)
    } else {
      this.db.prepare(`UPDATE tags SET updated_at = ? WHERE id = ?`).run(now, id)
    }

    logger.storage("Updated", "TAGS", id)
    return this.getTag(id)
  }

  deleteTag(id: Tag["id"]): boolean {
    const now = new Date().toISOString()

    let changes = 0
    const run = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM task_tags WHERE tag_id = ?`).run(id)
      const result = this.db.prepare(`UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id)
      changes = result.changes
    })

    run()

    logger.storage("Deleted", "TAGS", id)
    return changes > 0
  }

  /** Soft-deletes every tag in a project in one statement. Returns the ids it touched. */
  deleteTagsByBranch(branchId: Branch["id"]): Tag["id"][] {
    const now = new Date().toISOString()
    const rows = this.db
      .prepare(`UPDATE tags SET deleted_at = ?, updated_at = ? WHERE branch_id = ? AND deleted_at IS NULL RETURNING id`)
      .all<{id: string}>(now, now, branchId)

    logger.info(logger.CONTEXT.TAGS, `Deleted ${rows.length} tags for branch ${branchId}`)
    return rows.map((row) => row.id)
  }
}
