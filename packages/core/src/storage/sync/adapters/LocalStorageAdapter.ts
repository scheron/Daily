import type {
  ILocalStorage,
  SnapshotBranch,
  SnapshotDocs,
  SnapshotFile,
  SnapshotMilestone,
  SnapshotSubtask,
  SnapshotTag,
  SnapshotTask,
  SnapshotTaskComment,
  SnapshotTaskEvent,
  SnapshotTaskRelation,
} from "@daily/protocol"
import type {SqliteDriver} from "../../../database/SqliteDriver"
import type {FileModel} from "../../models/FileModel"

export class LocalStorageAdapter implements ILocalStorage {
  constructor(
    private db: SqliteDriver,
    private fileModel: FileModel,
  ) {}

  async loadAllDocs(): Promise<SnapshotDocs> {
    const tasks = this._loadTasks()
    const tags = this._loadTags()
    const branches = this._loadBranches()
    const milestones = this._loadMilestones()
    const relations = this._loadRelations()
    const comments = this._loadTaskComments()
    const subtasks = this._loadSubtasks()
    const files = this._loadFiles()
    const events = this._loadTaskEvents()

    return {tasks, tags, branches, milestones, relations, comments, subtasks, files, events}
  }

  async upsertDocs(docs: SnapshotDocs): Promise<void> {
    const transaction = this.db.transaction(() => {
      if (docs.branches.length) {
        const stmt = this.db.prepare(`
          INSERT INTO branches (id, name, description, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name        = excluded.name,
            description = excluded.description,
            created_at  = excluded.created_at,
            updated_at  = excluded.updated_at,
            deleted_at  = excluded.deleted_at
        `)
        for (const b of docs.branches) {
          stmt.run(b.id, b.name, b.description, b.created_at, b.updated_at, b.deleted_at)
        }
      }

      if (docs.milestones.length) {
        const stmt = this.db.prepare(`
          INSERT INTO milestones (id, branch_id, name, description, target_date, order_index, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            branch_id   = excluded.branch_id,
            name        = excluded.name,
            description = excluded.description,
            target_date = excluded.target_date,
            order_index = excluded.order_index,
            created_at  = excluded.created_at,
            updated_at  = excluded.updated_at,
            deleted_at  = excluded.deleted_at
        `)
        for (const m of docs.milestones) {
          stmt.run(m.id, m.branch_id, m.name, m.description, m.target_date, m.order_index, m.created_at, m.updated_at, m.deleted_at)
        }
      }

      if (docs.tags.length) {
        const stmt = this.db.prepare(`
          INSERT INTO tags (id, branch_id, name, color, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            branch_id  = excluded.branch_id,
            name       = excluded.name,
            color      = excluded.color,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
        `)
        for (const t of docs.tags) {
          stmt.run(t.id, t.branch_id, t.name, t.color, t.created_at, t.updated_at, t.deleted_at)
        }
      }

      if (docs.files.length) {
        const stmt = this.db.prepare(`
          INSERT INTO files (id, name, mime_type, size, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name       = excluded.name,
            mime_type  = excluded.mime_type,
            size       = excluded.size,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
        `)
        for (const f of docs.files) {
          stmt.run(f.id, f.name, f.mime_type, f.size, f.created_at, f.updated_at, f.deleted_at)
        }
      }

      if (docs.tasks.length) {
        const taskStmt = this.db.prepare(`
          INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, milestone_id, priority, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status             = excluded.status,
            content            = excluded.content,
            minimized          = excluded.minimized,
            order_index        = excluded.order_index,
            scheduled_date     = excluded.scheduled_date,
            scheduled_time     = excluded.scheduled_time,
            scheduled_timezone = excluded.scheduled_timezone,
            estimated_time     = excluded.estimated_time,
            spent_time         = excluded.spent_time,
            branch_id          = excluded.branch_id,
            milestone_id       = excluded.milestone_id,
            priority           = excluded.priority,
            created_at         = excluded.created_at,
            updated_at         = excluded.updated_at,
            deleted_at         = excluded.deleted_at
        `)
        const deleteTagsStmt = this.db.prepare(`DELETE FROM task_tags WHERE task_id = ?`)
        const insertTagStmt = this.db.prepare(
          `INSERT OR IGNORE INTO task_tags (task_id, tag_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM tags WHERE id = ?)`,
        )

        for (const t of docs.tasks) {
          taskStmt.run(
            t.id,
            t.status,
            t.content,
            t.minimized ? 1 : 0,
            t.order_index,
            t.scheduled_date,
            t.scheduled_time,
            t.scheduled_timezone,
            t.estimated_time,
            t.spent_time,
            t.branch_id,
            t.milestone_id,
            t.priority,
            t.created_at,
            t.updated_at,
            t.deleted_at,
          )

          deleteTagsStmt.run(t.id)
          for (const tagId of t.tags) {
            insertTagStmt.run(t.id, tagId, tagId)
          }
        }
      }

      if (docs.relations?.length) {
        const stmt = this.db.prepare(`
          INSERT INTO task_relations (id, blocker_id, blocked_id, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            blocker_id = excluded.blocker_id,
            blocked_id = excluded.blocked_id,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
        `)
        for (const r of docs.relations) {
          stmt.run(r.id, r.blocker_id, r.blocked_id, r.created_at, r.updated_at, r.deleted_at)
        }
      }

      if (docs.comments?.length) {
        const stmt = this.db.prepare(`
          INSERT INTO task_comments (id, task_id, branch_id, content, kind, provider, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            task_id    = excluded.task_id,
            branch_id  = excluded.branch_id,
            content    = excluded.content,
            kind       = excluded.kind,
            provider   = excluded.provider,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
        `)
        for (const c of docs.comments) {
          stmt.run(c.id, c.task_id, c.branch_id, c.content, c.kind || "manual", c.provider ?? null, c.created_at, c.updated_at, c.deleted_at)
        }
      }

      if (docs.subtasks?.length) {
        const stmt = this.db.prepare(`
          INSERT INTO subtasks (id, task_id, content, done, order_key, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            task_id    = excluded.task_id,
            content    = excluded.content,
            done       = excluded.done,
            order_key  = excluded.order_key,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
        `)
        for (const s of docs.subtasks) {
          stmt.run(s.id, s.task_id, s.content, s.done ? 1 : 0, s.order_key, s.created_at, s.updated_at, s.deleted_at)
        }
      }

      if (docs.events.length) {
        const stmt = this.db.prepare(`
          INSERT OR IGNORE INTO task_events (id, task_id, branch_id, type, event_date, from_date, to_date, created_at, kind, provider,
            from_status, to_status, from_priority, to_priority, from_branch_id, to_branch_id, sequence, move_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const e of docs.events) {
          stmt.run(
            e.id,
            e.task_id,
            e.branch_id,
            e.type,
            e.event_date,
            e.from_date ?? null,
            e.to_date ?? null,
            e.created_at,
            e.kind || "manual",
            e.provider ?? null,
            e.from_status ?? null,
            e.to_status ?? null,
            e.from_priority ?? null,
            e.to_priority ?? null,
            e.from_branch_id ?? null,
            e.to_branch_id ?? null,
            e.sequence ?? 0,
            e.move_id ?? null,
          )
        }
      }
    })

    transaction()
  }

  /**
   * Hard-delete soft-deleted rows whose `deleted_at` is older than `ttlMs`.
   * Mirrors the sync GC's TTL so local-only purging can't resurrect records that
   * a synced peer still holds: both sides drop the same tombstone past the same age.
   * @returns per-collection counts of physically removed rows.
   */
  async purgeExpiredDeleted(ttlMs: number): Promise<{
    tasks: number
    tags: number
    branches: number
    milestones: number
    relations: number
    comments: number
    subtasks: number
    files: number
  }> {
    const cutoff = new Date(Date.now() - ttlMs).toISOString()
    const expiredIds = (table: string): string[] =>
      (this.db.prepare(`SELECT id FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at <= ?`).all(cutoff) as {id: string}[]).map((row) => row.id)

    const tasks = expiredIds("tasks")
    const tags = expiredIds("tags")
    const branches = expiredIds("branches")
    const milestones = expiredIds("milestones")
    const relations = expiredIds("task_relations")
    const comments = expiredIds("task_comments")
    const subtasks = expiredIds("subtasks")
    const files = expiredIds("files")

    await this.deleteDocs({tasks, tags, branches, milestones, relations, comments, subtasks, files})

    return {
      tasks: tasks.length,
      tags: tags.length,
      branches: branches.length,
      milestones: milestones.length,
      relations: relations.length,
      comments: comments.length,
      subtasks: subtasks.length,
      files: files.length,
    }
  }

  async deleteDocs(ids: {
    tasks?: string[]
    tags?: string[]
    branches?: string[]
    milestones?: string[]
    relations?: string[]
    comments?: string[]
    subtasks?: string[]
    files?: string[]
  }): Promise<void> {
    const fileRows = ids.files?.length
      ? (this.db.prepare(`SELECT id, name FROM files WHERE id IN (${ids.files.map(() => "?").join(", ")})`).all(...ids.files) as {
          id: string
          name: string
        }[])
      : []

    const transaction = this.db.transaction(() => {
      if (ids.tasks?.length) {
        for (const id of ids.tasks) {
          this.db.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(id)
          this.db.prepare(`DELETE FROM task_relations WHERE blocker_id = ? OR blocked_id = ?`).run(id, id)
          this.db.prepare(`DELETE FROM task_comments WHERE task_id = ?`).run(id)
          this.db.prepare(`DELETE FROM subtasks WHERE task_id = ?`).run(id)
          this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)
        }
      }
      if (ids.tags?.length) {
        for (const id of ids.tags) {
          this.db.prepare(`DELETE FROM task_tags WHERE tag_id = ?`).run(id)
          this.db.prepare(`DELETE FROM tags WHERE id = ?`).run(id)
        }
      }
      if (ids.milestones?.length) {
        const clearTasksStmt = this.db.prepare(`UPDATE tasks SET milestone_id = NULL WHERE milestone_id = ?`)
        const deleteMilestoneStmt = this.db.prepare(`DELETE FROM milestones WHERE id = ?`)
        for (const id of ids.milestones) {
          clearTasksStmt.run(id)
          deleteMilestoneStmt.run(id)
        }
      }
      if (ids.relations?.length) {
        const deleteRelationStmt = this.db.prepare(`DELETE FROM task_relations WHERE id = ?`)
        for (const id of ids.relations) {
          deleteRelationStmt.run(id)
        }
      }
      if (ids.comments?.length) {
        const deleteCommentStmt = this.db.prepare(`DELETE FROM task_comments WHERE id = ?`)
        for (const id of ids.comments) {
          deleteCommentStmt.run(id)
        }
      }
      if (ids.subtasks?.length) {
        const deleteSubtaskStmt = this.db.prepare(`DELETE FROM subtasks WHERE id = ?`)
        for (const id of ids.subtasks) {
          deleteSubtaskStmt.run(id)
        }
      }
      if (ids.branches?.length) {
        const clearTasksMilestoneStmt = this.db.prepare(
          `UPDATE tasks SET milestone_id = NULL WHERE milestone_id IN (SELECT id FROM milestones WHERE branch_id = ?)`,
        )
        const deleteMilestonesStmt = this.db.prepare(`DELETE FROM milestones WHERE branch_id = ?`)
        const deleteTaskTagsStmt = this.db.prepare(`DELETE FROM task_tags WHERE tag_id IN (SELECT id FROM tags WHERE branch_id = ?)`)
        const deleteTagsStmt = this.db.prepare(`DELETE FROM tags WHERE branch_id = ?`)
        const reassignBranchStmt = this.db.prepare(`UPDATE tasks SET branch_id = 'main' WHERE branch_id = ?`)
        const reassignCommentsStmt = this.db.prepare(`UPDATE task_comments SET branch_id = 'main' WHERE branch_id = ?`)
        const deleteBranchStmt = this.db.prepare(`DELETE FROM branches WHERE id = ?`)
        for (const id of ids.branches) {
          clearTasksMilestoneStmt.run(id)
          deleteMilestonesStmt.run(id)
          deleteTaskTagsStmt.run(id)
          deleteTagsStmt.run(id)
          reassignBranchStmt.run(id)
          reassignCommentsStmt.run(id)
          deleteBranchStmt.run(id)
        }
      }
      if (ids.files?.length) {
        for (const id of ids.files) {
          this.db.prepare(`DELETE FROM files WHERE id = ?`).run(id)
        }
      }
    })

    transaction()

    if (fileRows.length) await this.fileModel.deleteAssets(fileRows)
  }

  private _loadTasks(): SnapshotTask[] {
    const rows = this.db.prepare(`SELECT * FROM tasks`).all() as any[]
    return rows.map((row) => {
      const tagRows = this.db.prepare(`SELECT tag_id FROM task_tags WHERE task_id = ?`).all(row.id) as {tag_id: string}[]

      return {
        id: row.id,
        status: row.status,
        content: row.content,
        minimized: row.minimized === 1,
        order_index: row.order_index,
        scheduled_date: row.scheduled_date,
        scheduled_time: row.scheduled_time,
        scheduled_timezone: row.scheduled_timezone,
        estimated_time: row.estimated_time,
        spent_time: row.spent_time,
        branch_id: row.branch_id,
        milestone_id: row.milestone_id ?? null,
        priority: row.priority as SnapshotTask["priority"],
        tags: tagRows.map((r) => r.tag_id),
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
      }
    })
  }

  private _loadTags(): SnapshotTag[] {
    return (this.db.prepare(`SELECT * FROM tags`).all() as any[]).map((row) => ({
      id: row.id,
      branch_id: row.branch_id,
      name: row.name,
      color: row.color,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    }))
  }

  private _loadBranches(): SnapshotBranch[] {
    return (this.db.prepare(`SELECT * FROM branches`).all() as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    }))
  }

  private _loadMilestones(): SnapshotMilestone[] {
    return (this.db.prepare(`SELECT * FROM milestones`).all() as any[]).map((row) => ({
      id: row.id,
      branch_id: row.branch_id,
      name: row.name,
      description: row.description,
      target_date: row.target_date ?? null,
      order_index: row.order_index,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    }))
  }

  private _loadRelations(): SnapshotTaskRelation[] {
    return (this.db.prepare(`SELECT * FROM task_relations`).all() as any[]).map((row) => ({
      id: row.id,
      blocker_id: row.blocker_id,
      blocked_id: row.blocked_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    }))
  }

  private _loadTaskComments(): SnapshotTaskComment[] {
    return (this.db.prepare(`SELECT * FROM task_comments`).all() as any[]).map((row) => ({
      id: row.id,
      task_id: row.task_id,
      branch_id: row.branch_id,
      content: row.content,
      kind: row.kind ?? "manual",
      provider: row.provider ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    }))
  }

  private _loadSubtasks(): SnapshotSubtask[] {
    return (this.db.prepare(`SELECT * FROM subtasks`).all() as any[]).map((row) => ({
      id: row.id,
      task_id: row.task_id,
      content: row.content,
      done: row.done === 1,
      order_key: row.order_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    }))
  }

  private _loadFiles(): SnapshotFile[] {
    return (this.db.prepare(`SELECT * FROM files`).all() as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      mime_type: row.mime_type,
      size: row.size,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    }))
  }

  private _loadTaskEvents(): SnapshotTaskEvent[] {
    return (this.db.prepare(`SELECT * FROM task_events`).all() as any[]).map((row) => ({
      id: row.id,
      task_id: row.task_id,
      branch_id: row.branch_id,
      type: row.type,
      event_date: row.event_date,
      from_date: row.from_date ?? null,
      to_date: row.to_date ?? null,
      created_at: row.created_at,
      kind: row.kind ?? "manual",
      provider: row.provider ?? null,
      from_status: row.from_status ?? null,
      to_status: row.to_status ?? null,
      from_priority: row.from_priority ?? null,
      to_priority: row.to_priority ?? null,
      from_branch_id: row.from_branch_id ?? null,
      to_branch_id: row.to_branch_id ?? null,
      sequence: row.sequence ?? 0,
      move_id: row.move_id ?? null,
    }))
  }
}
