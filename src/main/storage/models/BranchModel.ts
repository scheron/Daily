import {nanoid} from "nanoid"

import {MAIN_BRANCH_ID, MAIN_BRANCH_NAME} from "@shared/constants/storage"
import {logger} from "@/utils/logger"

import {rowToBranch} from "./_rowMappers"

import type {ID} from "@shared/types/common"
import type {Branch} from "@shared/types/storage"
import type Database from "better-sqlite3"

export class BranchModel {
  constructor(private db: Database.Database) {}

  invalidateCache(): void {
    // no-op for backward compatibility
  }

  ensureMainBranch(): void {
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
    let sql = `SELECT id, name, created_at, updated_at, deleted_at FROM branches`

    if (!params?.includeDeleted) {
      sql += ` WHERE deleted_at IS NULL`
    }

    const rows = this.db.prepare(sql).all() as any[]

    logger.info(logger.CONTEXT.BRANCHES, `Loaded ${rows.length} branches from database`)

    return rows.map(rowToBranch)
  }

  getBranch(id: ID, params?: {includeDeleted?: boolean}): Branch | null {
    const row = this.db
      .prepare(
        `
      SELECT id, name, created_at, updated_at, deleted_at FROM branches WHERE id = ?
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

  createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Branch | null {
    const id = nanoid()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
      INSERT INTO branches (id, name, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, NULL)
    `,
      )
      .run(id, branch.name, now, now)

    logger.storage("Created", "BRANCHES", id)
    return this.getBranch(id, {includeDeleted: true})
  }

  updateBranch(id: ID, updates: Pick<Branch, "name">): Branch | null {
    if (id === MAIN_BRANCH_ID) {
      logger.warn(logger.CONTEXT.BRANCHES, "Main branch cannot be renamed")
      return null
    }

    const now = new Date().toISOString()

    this.db
      .prepare(
        `
      UPDATE branches SET name = ?, updated_at = ? WHERE id = ?
    `,
      )
      .run(updates.name, now, id)

    logger.storage("Updated", "BRANCHES", id)
    return this.getBranch(id)
  }

  deleteBranch(id: ID): boolean {
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
