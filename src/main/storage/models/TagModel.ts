import {nanoid} from "nanoid"

import {logger} from "@/utils/logger"

import {rowToTag} from "./_rowMappers"

import type {ID} from "@shared/types/common"
import type {Tag} from "@shared/types/storage"
import type Database from "better-sqlite3"

export class TagModel {
  constructor(private db: Database.Database) {}

  invalidateCache(): void {
    // no-op for backward compatibility
  }

  getTagList(params?: {includeDeleted?: boolean}): Tag[] {
    let sql = `SELECT id, name, color, created_at, updated_at, deleted_at FROM tags`

    if (!params?.includeDeleted) {
      sql += ` WHERE deleted_at IS NULL`
    }

    const rows = this.db.prepare(sql).all() as any[]

    logger.info(logger.CONTEXT.TAGS, `Loaded ${rows.length} tags from database`)

    return rows.map(rowToTag)
  }

  getTag(id: ID): Tag | null {
    const row = this.db
      .prepare(
        `
      SELECT id, name, color, created_at, updated_at, deleted_at FROM tags WHERE id = ?
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
      INSERT INTO tags (id, name, color, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, tag.name, tag.color, now, now, tag.deletedAt ?? null)

    logger.storage("Created", "TAGS", id)
    return this.getTag(id)
  }

  updateTag(id: ID, updates: Partial<Pick<Tag, "color" | "name">>): Tag | null {
    const now = new Date().toISOString()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setClauses.push("name = ?")
      values.push(updates.name)
    }

    if (updates.color !== undefined) {
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

  deleteTag(id: ID): boolean {
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
}
