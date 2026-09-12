import {nanoid} from "nanoid"

import {MAIN_BRANCH_ID, MAIN_BRANCH_NAME} from "@daily/protocol"
import {notUndefined} from "@daily/std"

import {logger} from "../../utils/logger"
import {rowToBranch} from "./_rowMappers"

import type {Branch} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"

export class BranchModel {
  constructor(private db: SqliteDriver) {}

  ensureMainBranch() {
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
      INSERT OR IGNORE INTO branches (id, name, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, NULL)
    `,
      )
      .run(MAIN_BRANCH_ID, MAIN_BRANCH_NAME, now, now)

    this.db
      .prepare(
        `
      UPDATE branches SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL
    `,
      )
      .run(now, MAIN_BRANCH_ID)
  }

  getBranchList(params?: {includeDeleted?: boolean}): Branch[] {
    let sql = `SELECT id, name, description, created_at, updated_at, deleted_at FROM branches`

    if (!params?.includeDeleted) {
      sql += ` WHERE deleted_at IS NULL`
    }

    const rows = this.db.prepare(sql).all() as any[]

    logger.info(logger.CONTEXT.BRANCHES, `Loaded ${rows.length} branches from database`)

    return rows.map(rowToBranch)
  }

  getBranch(id: Branch["id"], params?: {includeDeleted?: boolean}): Branch | null {
    const row = this.db
      .prepare(
        `
      SELECT id, name, description, created_at, updated_at, deleted_at FROM branches WHERE id = ?
    `,
      )
      .get(id) as any

    if (!row) {
      logger.debug(logger.CONTEXT.BRANCHES, `Branch not found: ${id}`)
      return null
    }

    const branch = rowToBranch(row)

    if (!params?.includeDeleted && branch.deletedAt) {
      return null
    }

    return branch
  }

  createBranch(branch: Pick<Branch, "name"> & Partial<Pick<Branch, "description">>): Branch | null {
    const id = nanoid()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
      INSERT INTO branches (id, name, description, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `,
      )
      .run(id, branch.name, branch.description ?? "", now, now)

    logger.storage("Created", "BRANCHES", id)
    return this.getBranch(id, {includeDeleted: true})
  }

  updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "description" | "name">>): Branch | null {
    if (id === MAIN_BRANCH_ID && notUndefined(updates.name)) {
      logger.warn(logger.CONTEXT.BRANCHES, "Main branch cannot be renamed")
      return null
    }

    const now = new Date().toISOString()
    const setClauses: string[] = []
    const values: any[] = []

    if (notUndefined(updates.name)) {
      setClauses.push("name = ?")
      values.push(updates.name)
    }

    if (notUndefined(updates.description)) {
      setClauses.push("description = ?")
      values.push(updates.description)
    }

    if (setClauses.length > 0) {
      this.db.prepare(`UPDATE branches SET ${setClauses.join(", ")}, updated_at = ? WHERE id = ?`).run(...values, now, id)
    } else {
      this.db.prepare(`UPDATE branches SET updated_at = ? WHERE id = ?`).run(now, id)
    }

    logger.storage("Updated", "BRANCHES", id)
    return this.getBranch(id)
  }

  deleteBranch(id: Branch["id"]): boolean {
    if (id === MAIN_BRANCH_ID) {
      logger.warn(logger.CONTEXT.BRANCHES, "Main branch cannot be deleted")
      return false
    }

    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `
      UPDATE branches SET deleted_at = ?, updated_at = ? WHERE id = ?
    `,
      )
      .run(now, now, id)

    logger.storage("Deleted", "BRANCHES", id)
    return result.changes > 0
  }
}
