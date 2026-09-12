import {nanoid} from "nanoid"

import {getNextTaskOrderIndex} from "@daily/protocol"
import {notUndefined} from "@daily/std"

import {logger} from "../../utils/logger"
import {rowToMilestone} from "./_rowMappers"

import type {Branch, Milestone, MilestoneView} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"

const MILESTONE_SELECT = `
  SELECT
    m.id,
    m.branch_id,
    m.name,
    m.description,
    m.target_date,
    m.order_index,
    m.created_at,
    m.updated_at,
    m.deleted_at,
    (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = m.id AND t.deleted_at IS NULL) AS total_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = m.id AND t.deleted_at IS NULL
       AND t.status IN ('done', 'discarded')) AS resolved_tasks
  FROM milestones m
`

export class MilestoneModel {
  constructor(private db: SqliteDriver) {}

  getMilestoneList(params?: {branchId?: Branch["id"]; includeDeleted?: boolean}): MilestoneView[] {
    const conditions: string[] = []
    const values: any[] = []

    if (!params?.includeDeleted) {
      conditions.push("m.deleted_at IS NULL")
    }

    if (params?.branchId) {
      conditions.push("m.branch_id = ?")
      values.push(params.branchId)
    }

    let sql = MILESTONE_SELECT
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`
    }
    sql += ` ORDER BY m.order_index ASC`

    const rows = this.db.prepare(sql).all(...values) as any[]

    logger.info(logger.CONTEXT.MILESTONES, `Loaded ${rows.length} milestones from database`)

    return rows.map(rowToMilestoneView)
  }

  getMilestone(id: Milestone["id"]): MilestoneView | null {
    const row = this.db.prepare(`${MILESTONE_SELECT} WHERE m.id = ?`).get(id) as any

    if (!row) {
      logger.debug(logger.CONTEXT.MILESTONES, `Milestone not found: ${id}`)
      return null
    }

    return rowToMilestoneView(row)
  }

  createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): MilestoneView | null {
    const id = nanoid()
    const now = new Date().toISOString()
    const orderIndex = getNextTaskOrderIndex(this.getMilestoneList({branchId: milestone.branchId}))

    this.db
      .prepare(
        `
      INSERT INTO milestones (id, branch_id, name, description, target_date, order_index, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        id,
        milestone.branchId,
        milestone.name,
        milestone.description,
        milestone.targetDate ?? null,
        orderIndex,
        now,
        now,
        milestone.deletedAt ?? null,
      )

    logger.storage("Created", "MILESTONES", id)
    return this.getMilestone(id)
  }

  updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): MilestoneView | null {
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

    if (notUndefined(updates.targetDate)) {
      setClauses.push("target_date = ?")
      values.push(updates.targetDate)
    }

    if (notUndefined(updates.orderIndex)) {
      setClauses.push("order_index = ?")
      values.push(updates.orderIndex)
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

    logger.storage("Updated", "MILESTONES", id)
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

    logger.storage("Deleted", "MILESTONES", id)
    return changes > 0
  }

  /** Soft-deletes every milestone in a project in one statement. Returns the ids it touched. */
  deleteMilestonesByBranch(branchId: Branch["id"]): Milestone["id"][] {
    const now = new Date().toISOString()
    const rows = this.db
      .prepare(`UPDATE milestones SET deleted_at = ?, updated_at = ? WHERE branch_id = ? AND deleted_at IS NULL RETURNING id`)
      .all<{id: string}>(now, now, branchId)

    logger.info(logger.CONTEXT.MILESTONES, `Deleted ${rows.length} milestones for branch ${branchId}`)
    return rows.map((row) => row.id)
  }
}

function rowToMilestoneView(row: any): MilestoneView {
  return {
    ...rowToMilestone(row),
    progress: {
      total: row.total_tasks,
      resolved: row.resolved_tasks,
    },
  }
}
