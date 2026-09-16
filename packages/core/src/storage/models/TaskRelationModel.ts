import {notNull} from "@daily/std"

import {rowToTaskRelation} from "./_rowMappers"

import type {Task, TaskRelation, TaskRelationPlan} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"
import type {TaskRelationRow} from "./_rowMappers"

const TASK_RELATION_SELECT = `
  SELECT id, blocker_id, blocked_id, created_at, updated_at, deleted_at
  FROM task_relations
`

export class TaskRelationModel {
  constructor(private db: SqliteDriver) {}

  getRelationList(): TaskRelation[] {
    const rows = this.db.prepare(`${TASK_RELATION_SELECT} WHERE deleted_at IS NULL ORDER BY created_at ASC, id ASC`).all<TaskRelationRow>()

    return rows.map(rowToTaskRelation)
  }

  getRelationsOfTasks(taskIds: Task["id"][]): TaskRelation[] {
    if (taskIds.length === 0) return []

    const placeholders = taskIds.map(() => "?").join(", ")
    const rows = this.db
      .prepare(
        `${TASK_RELATION_SELECT}
         WHERE deleted_at IS NULL AND (blocker_id IN (${placeholders}) OR blocked_id IN (${placeholders}))
         ORDER BY created_at ASC, id ASC`,
      )
      .all<TaskRelationRow>(...taskIds, ...taskIds)

    return rows.map(rowToTaskRelation)
  }

  applyPlan(plan: TaskRelationPlan): {upserted: TaskRelation[]; removed: TaskRelation["id"][]} {
    const now = new Date().toISOString()
    const removed: TaskRelation["id"][] = []

    const run = this.db.transaction(() => {
      for (const link of plan.linked) {
        this.db
          .prepare(
            `
          INSERT INTO task_relations (id, blocker_id, blocked_id, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, NULL)
          ON CONFLICT(id) DO UPDATE SET
            blocker_id = excluded.blocker_id,
            blocked_id = excluded.blocked_id,
            updated_at = excluded.updated_at,
            deleted_at = NULL
        `,
          )
          .run(link.id, link.blockerId, link.blockedId, now, now)
      }

      for (const id of plan.unlinked) {
        const touched = this.db
          .prepare(`UPDATE task_relations SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id`)
          .all<{id: string}>(now, now, id)
        removed.push(...touched.map((row) => row.id))
      }
    })

    run()

    const upserted = plan.linked.map((link) => this.getRelation(link.id)).filter(notNull)
    return {upserted, removed}
  }

  deleteRelations(ids: TaskRelation["id"][]): TaskRelation["id"][] {
    if (ids.length === 0) return []

    const now = new Date().toISOString()
    const removed: TaskRelation["id"][] = []

    const run = this.db.transaction(() => {
      for (const id of ids) {
        const touched = this.db
          .prepare(`UPDATE task_relations SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id`)
          .all<{id: string}>(now, now, id)
        removed.push(...touched.map((row) => row.id))
      }
    })

    run()

    return removed
  }

  private getRelation(id: TaskRelation["id"]): TaskRelation | null {
    const row = this.db.prepare(`${TASK_RELATION_SELECT} WHERE id = ?`).get<TaskRelationRow>(id)
    if (!row) return null

    return rowToTaskRelation(row)
  }
}
