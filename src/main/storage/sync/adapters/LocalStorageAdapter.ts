import type {ILocalStorage, SnapshotBranch, SnapshotDocs, SnapshotFile, SnapshotSettings, SnapshotTag, SnapshotTask} from "@/types/sync"
import type Database from "better-sqlite3"

export class LocalStorageAdapter implements ILocalStorage {
  constructor(private db: Database.Database) {}

  async loadAllDocs(): Promise<SnapshotDocs> {
    const tasks = this._loadTasks()
    const tags = this._loadTags()
    const branches = this._loadBranches()
    const files = this._loadFiles()
    const settings = this._loadSettings()

    return {tasks, tags, branches, files, settings}
  }

  async upsertDocs(docs: SnapshotDocs): Promise<void> {
    const transaction = this.db.transaction(() => {
      /* Branches: ON CONFLICT DO UPDATE keeps parent rows so tasks.branch_id FK is not violated (no ON DELETE CASCADE). */
      if (docs.branches.length) {
        const stmt = this.db.prepare(`
          INSERT INTO branches (id, name, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name       = excluded.name,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
        `)
        for (const b of docs.branches) {
          stmt.run(b.id, b.name, b.created_at, b.updated_at, b.deleted_at)
        }
      }

      if (docs.tags.length) {
        const stmt = this.db.prepare(`
          INSERT INTO tags (id, name, color, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name       = excluded.name,
            color      = excluded.color,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
        `)
        for (const t of docs.tags) {
          stmt.run(t.id, t.name, t.color, t.created_at, t.updated_at, t.deleted_at)
        }
      }

      /* Files before tasks: satisfy task_attachments FK to files. */
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
          INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            created_at         = excluded.created_at,
            updated_at         = excluded.updated_at,
            deleted_at         = excluded.deleted_at
        `)
        const deleteTagsStmt = this.db.prepare(`DELETE FROM task_tags WHERE task_id = ?`)
        const insertTagStmt = this.db.prepare(
          `INSERT OR IGNORE INTO task_tags (task_id, tag_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM tags WHERE id = ?)`,
        )
        const deleteAttachmentsStmt = this.db.prepare(`DELETE FROM task_attachments WHERE task_id = ?`)
        const insertAttachmentStmt = this.db.prepare(
          `INSERT OR IGNORE INTO task_attachments (task_id, file_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM files WHERE id = ?)`,
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
            t.created_at,
            t.updated_at,
            t.deleted_at,
          )

          deleteTagsStmt.run(t.id)
          for (const tagId of t.tags) {
            insertTagStmt.run(t.id, tagId, tagId)
          }

          deleteAttachmentsStmt.run(t.id)
          for (const fileId of t.attachments) {
            insertAttachmentStmt.run(t.id, fileId, fileId)
          }
        }
      }

      if (docs.settings) {
        const {id, created_at, updated_at, ...data} = docs.settings
        this.db
          .prepare(
            `
            INSERT INTO settings (id, version, data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              version    = excluded.version,
              data       = excluded.data,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at
          `,
          )
          .run(id, data.version, JSON.stringify(data), created_at, updated_at)
      }
    })

    transaction()
  }

  async deleteDocs(ids: {tasks?: string[]; tags?: string[]; branches?: string[]; files?: string[]}): Promise<void> {
    const transaction = this.db.transaction(() => {
      if (ids.tasks?.length) {
        for (const id of ids.tasks) {
          this.db.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(id)
          this.db.prepare(`DELETE FROM task_attachments WHERE task_id = ?`).run(id)
          this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)
        }
      }
      if (ids.tags?.length) {
        for (const id of ids.tags) {
          this.db.prepare(`DELETE FROM task_tags WHERE tag_id = ?`).run(id)
          this.db.prepare(`DELETE FROM tags WHERE id = ?`).run(id)
        }
      }
      if (ids.branches?.length) {
        const reassignBranchStmt = this.db.prepare(`UPDATE tasks SET branch_id = 'main' WHERE branch_id = ?`)
        const deleteBranchStmt = this.db.prepare(`DELETE FROM branches WHERE id = ?`)
        for (const id of ids.branches) {
          reassignBranchStmt.run(id)
          deleteBranchStmt.run(id)
        }
      }
      if (ids.files?.length) {
        for (const id of ids.files) {
          this.db.prepare(`DELETE FROM task_attachments WHERE file_id = ?`).run(id)
          this.db.prepare(`DELETE FROM files WHERE id = ?`).run(id)
        }
      }
    })

    transaction()
  }

  private _loadTasks(): SnapshotTask[] {
    const rows = this.db.prepare(`SELECT * FROM tasks`).all() as any[]
    return rows.map((row) => {
      const tagRows = this.db.prepare(`SELECT tag_id FROM task_tags WHERE task_id = ?`).all(row.id) as {tag_id: string}[]
      const attachmentRows = this.db.prepare(`SELECT file_id FROM task_attachments WHERE task_id = ?`).all(row.id) as {file_id: string}[]

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
        tags: tagRows.map((r) => r.tag_id),
        attachments: attachmentRows.map((r) => r.file_id),
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
      }
    })
  }

  private _loadTags(): SnapshotTag[] {
    return (this.db.prepare(`SELECT * FROM tags`).all() as any[]).map((row) => ({
      id: row.id,
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

  private _loadSettings(): SnapshotSettings | null {
    const row = this.db.prepare(`SELECT * FROM settings WHERE id = 'default'`).get() as any
    if (!row) return null
    const data = JSON.parse(row.data)
    return {
      id: row.id,
      ...data,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}
