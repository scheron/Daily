import {nanoid} from "nanoid"

import {MAIN_BRANCH_ID} from "@daily/protocol"
import {notUndefined} from "@daily/std"

import {logger} from "../../utils/logger"
import {rowToMilestone} from "./_rowMappers"

import type {Branch, Milestone} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"

export class MilestoneModel {
  constructor(private db: SqliteDriver) {}

  getMilestoneList(params?: {branchId?: Branch["id"]; includeDeleted?: boolean}): Milestone[] {
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
    const sql = `
      SELECT id, branch_id, name, date, description, created_at, updated_at, deleted_at FROM milestones
      ${where} ORDER BY date IS NULL, date, name COLLATE NOCASE
    `

    const rows = this.db.prepare(sql).all(...values) as any[]

    logger.info(logger.CONTEXT.MILESTONES, `Loaded ${rows.length} milestones from database`)

    return rows.map(rowToMilestone)
  }

  getMilestone(id: Milestone["id"]): Milestone | null {
    const row = this.db
      .prepare(
        `
      SELECT id, branch_id, name, date, description, created_at, updated_at, deleted_at FROM milestones WHERE id = ?
    `,
      )
      .get(id) as any

    if (!row) {
      logger.debug(logger.CONTEXT.MILESTONES, `Milestone not found: ${id}`)
      return null
    }

    return rowToMilestone(row)
  }

  createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt">): Milestone | null {
    const id = nanoid()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
      INSERT INTO milestones (id, branch_id, name, date, description, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, milestone.branchId, milestone.name, milestone.date ?? null, milestone.description ?? null, now, now, milestone.deletedAt ?? null)

    logger.storage("Created", logger.CONTEXT.MILESTONES, id)
    return this.getMilestone(id)
  }

  updateMilestone(id: Milestone["id"], updates: Partial<Pick<Milestone, "name" | "date" | "description">>): Milestone | null {
    const now = new Date().toISOString()
    const setClauses: string[] = []
    const values: any[] = []

    if (notUndefined(updates.name)) {
      setClauses.push("name = ?")
      values.push(updates.name)
    }

    if (notUndefined(updates.date)) {
      setClauses.push("date = ?")
      values.push(updates.date)
    }

    if (notUndefined(updates.description)) {
      setClauses.push("description = ?")
      values.push(updates.description)
    }

    if (setClauses.length > 0) {
      this.db
        .prepare(
          `
        UPDATE milestones SET ${setClauses.join(", ")}, updated_at = ? WHERE id = ?
      `,
        )
        .run(...values, now, id)
    } else {
      this.db.prepare(`UPDATE milestones SET updated_at = ? WHERE id = ?`).run(now, id)
    }

    logger.storage("Updated", logger.CONTEXT.MILESTONES, id)
    return this.getMilestone(id)
  }

  deleteMilestone(id: Milestone["id"]): boolean {
    const now = new Date().toISOString()

    let changes = 0
    const run = this.db.transaction(() => {
      this.db.prepare(`UPDATE tasks SET milestone_id = NULL WHERE milestone_id = ?`).run(id)
      const result = this.db.prepare(`UPDATE milestones SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id)
      changes = result.changes
    })

    run()

    logger.storage("Deleted", logger.CONTEXT.MILESTONES, id)
    return changes > 0
  }
}
