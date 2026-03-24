import crypto from "node:crypto"
import os from "node:os"

import type {
  ChangeLogEntry,
  DeltaMergeResult,
  DeltaRecord,
  FieldConflict,
  ILocalStorage,
  SnapshotBranch,
  SnapshotDocs,
  SnapshotFile,
  SnapshotSettings,
  SnapshotTag,
  SnapshotTask,
  SyncAuditEntry,
  SyncStrategy,
} from "@/types/sync"
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

  async getDeviceId(): Promise<string> {
    const row = this.db.prepare("SELECT value FROM sync_meta WHERE key = 'device_id'").get() as {value: string} | undefined
    if (row) return row.value

    const deviceId = crypto.randomUUID()
    const deviceName = os.hostname()
    this.db.prepare("INSERT INTO sync_meta (key, value) VALUES ('device_id', ?)").run(deviceId)
    this.db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('device_name', ?)").run(deviceName)
    this.db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sequence', '0')").run()

    return deviceId
  }

  async getUnsyncedChanges(): Promise<ChangeLogEntry[]> {
    return this.db.prepare("SELECT * FROM change_log WHERE synced = 0 ORDER BY sequence ASC").all() as ChangeLogEntry[]
  }

  async getChangesSince(deviceId: string, afterSequence: number): Promise<ChangeLogEntry[]> {
    return this.db
      .prepare("SELECT * FROM change_log WHERE device_id = ? AND sequence > ? ORDER BY sequence ASC")
      .all(deviceId, afterSequence) as ChangeLogEntry[]
  }

  async markChangesSynced(upToSequence: number): Promise<void> {
    this.db.prepare("UPDATE change_log SET synced = 1 WHERE synced = 0 AND sequence <= ?").run(upToSequence)
  }

  async applyRemoteDeltas(deltas: DeltaRecord[], strategy: SyncStrategy): Promise<DeltaMergeResult> {
    let docsUpserted = 0
    let docsDeleted = 0
    const conflicts: FieldConflict[] = []
    const updatedCursors: Record<string, number> = {}

    const transaction = this.db.transaction(() => {
      // Suppress triggers
      this.db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('applying_remote', '1')").run()

      try {
        // Group deltas by entity+doc_id
        const grouped = new Map<string, DeltaRecord[]>()
        for (const delta of deltas) {
          const key = `${delta.entity}:${delta.doc_id}`
          if (!grouped.has(key)) grouped.set(key, [])
          grouped.get(key)!.push(delta)

          // Track cursors
          const prev = updatedCursors[delta.device_id] ?? 0
          if (delta.sequence > prev) updatedCursors[delta.device_id] = delta.sequence
        }

        for (const [, entityDeltas] of grouped) {
          const first = entityDeltas[0]
          const lastOp = entityDeltas[entityDeltas.length - 1].operation

          if (lastOp === "delete") {
            this._applyDelete(first.entity, first.doc_id)
            docsDeleted++
            continue
          }

          if (lastOp === "insert" || this._entityExists(first.entity, first.doc_id) === false) {
            this._applyInsert(first.entity, first.doc_id, entityDeltas)
            docsUpserted++
            continue
          }

          // Update: field-level LWW (compare only local UPDATE changes, not INSERT initial values)
          const localChanges = this.db
            .prepare("SELECT * FROM change_log WHERE doc_id = ? AND entity = ? AND operation = 'update' ORDER BY changed_at DESC")
            .all(first.doc_id, first.entity) as ChangeLogEntry[]

          const fieldsToApply: Record<string, string | null> = {}

          for (const delta of entityDeltas) {
            if (delta.operation !== "update" || !delta.field_name) continue

            const localChange = localChanges.find((c) => c.field_name === delta.field_name)

            if (!localChange) {
              // Only remote changed — apply
              fieldsToApply[delta.field_name] = delta.new_value
            } else {
              // Both changed — LWW
              const localTime = new Date(localChange.changed_at).getTime()
              const remoteTime = new Date(delta.changed_at).getTime()
              let remoteWins: boolean

              if (remoteTime > localTime) {
                remoteWins = true
              } else if (remoteTime < localTime) {
                remoteWins = false
              } else {
                remoteWins = strategy === "pull"
              }

              conflicts.push({
                entity: delta.entity,
                doc_id: delta.doc_id,
                field_name: delta.field_name,
                local_value: localChange.new_value,
                remote_value: delta.new_value,
                local_changed_at: localChange.changed_at,
                remote_changed_at: delta.changed_at,
                outcome: remoteWins ? "remote_wins" : "local_wins",
                resolved_value: remoteWins ? delta.new_value : localChange.new_value,
              })

              if (remoteWins) {
                fieldsToApply[delta.field_name] = delta.new_value
              }
            }
          }

          if (Object.keys(fieldsToApply).length > 0) {
            this._applyFieldUpdates(first.entity, first.doc_id, fieldsToApply)
            docsUpserted++
          }
        }
      } finally {
        // Re-enable triggers
        this.db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('applying_remote', '0')").run()
      }
    })

    transaction()

    return {
      remote_deltas_processed: deltas.length,
      docs_upserted: docsUpserted,
      docs_deleted: docsDeleted,
      conflicts,
      conflict_count: conflicts.length,
      updated_cursors: updatedCursors,
    }
  }

  private _entityExists(entity: string, docId: string): boolean {
    const tableMap: Record<string, string> = {
      task: "tasks",
      tag: "tags",
      branch: "branches",
      file: "files",
      settings: "settings",
    }
    const table = tableMap[entity]
    if (!table) return false
    const row = this.db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(docId)
    return !!row
  }

  private _applyDelete(entity: string, docId: string): void {
    const tableMap: Record<string, string> = {task: "tasks", tag: "tags", branch: "branches", file: "files"}
    const table = tableMap[entity]
    if (!table) return

    // Soft delete by setting deleted_at
    this.db.prepare(`UPDATE ${table} SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(docId)
  }

  private _applyInsert(entity: string, docId: string, entityDeltas: DeltaRecord[]): void {
    // Collect all field values from deltas
    const fields: Record<string, string | null> = {}
    for (const delta of entityDeltas) {
      if (delta.field_name) {
        fields[delta.field_name] = delta.new_value
      }
    }

    const now = new Date().toISOString()

    switch (entity) {
      case "task": {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            docId,
            this._unquote(fields.status) ?? "active",
            this._unquote(fields.content) ?? "",
            fields.minimized ? parseInt(fields.minimized) : 0,
            fields.order_index ? parseFloat(fields.order_index) : 0,
            this._unquote(fields.scheduled_date) ?? now.split("T")[0],
            this._unquote(fields.scheduled_time) ?? "",
            this._unquote(fields.scheduled_timezone) ?? "UTC",
            fields.estimated_time ? parseInt(fields.estimated_time) : 0,
            fields.spent_time ? parseInt(fields.spent_time) : 0,
            this._unquote(fields.branch_id) ?? "main",
            now,
            now,
            this._unquote(fields.deleted_at),
          )
        break
      }
      case "tag": {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO tags (id, name, color, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(docId, this._unquote(fields.name) ?? "", this._unquote(fields.color) ?? "#000000", now, now, this._unquote(fields.deleted_at))
        break
      }
      case "branch": {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO branches (id, name, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?)`,
          )
          .run(docId, this._unquote(fields.name) ?? "", now, now, this._unquote(fields.deleted_at))
        break
      }
      case "file": {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO files (id, name, mime_type, size, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            docId,
            this._unquote(fields.name) ?? "",
            this._unquote(fields.mime_type) ?? "application/octet-stream",
            fields.size ? parseInt(fields.size) : 0,
            now,
            now,
            this._unquote(fields.deleted_at),
          )
        break
      }
    }
  }

  private _applyFieldUpdates(entity: string, docId: string, fields: Record<string, string | null>): void {
    const tableMap: Record<string, string> = {task: "tasks", tag: "tags", branch: "branches", file: "files"}
    const table = tableMap[entity]

    if (entity === "settings") {
      // Settings: merge JSON data
      const row = this.db.prepare("SELECT data FROM settings WHERE id = ?").get(docId) as {data: string} | undefined
      if (row) {
        const currentData = JSON.parse(row.data)
        // For settings, field_name is null and old_value/new_value are full JSON blobs
        // Apply the new_value directly as the data
        for (const [fieldName, value] of Object.entries(fields)) {
          if (fieldName === null || fieldName === "null") {
            // Full settings blob replacement
            if (value) {
              this.db.prepare("UPDATE settings SET data = ?, updated_at = datetime('now') WHERE id = ?").run(value, docId)
            }
          } else {
            currentData[fieldName] = value
          }
        }
      }
      return
    }

    if (!table) return

    // Handle junction table fields separately
    if (fields.tags !== undefined && entity === "task") {
      // tags field changes are tracked as individual add/remove operations
      // The new_value contains the tag_id to add, old_value the tag_id to remove
      delete fields.tags
    }
    if (fields.attachments !== undefined && entity === "task") {
      delete fields.attachments
    }

    const setClauses: string[] = []
    const values: any[] = []

    for (const [fieldName, value] of Object.entries(fields)) {
      // Map field names to column names (they're the same in this schema)
      setClauses.push(`${fieldName} = ?`)
      values.push(this._unquote(value))
    }

    if (setClauses.length === 0) return

    setClauses.push("updated_at = datetime('now')")
    values.push(docId)

    this.db.prepare(`UPDATE ${table} SET ${setClauses.join(", ")} WHERE id = ?`).run(...values)
  }

  private _unquote(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value === "NULL") return null
    // SQLite quote() wraps strings in single quotes: 'value'
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1).replace(/''/g, "'")
    }
    return value
  }

  async writeSyncAudit(entry: Omit<SyncAuditEntry, "id">): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sync_audit (started_at, completed_at, duration_ms, strategy, outcome, deltas_pushed, deltas_pulled, conflicts_resolved, docs_upserted, docs_deleted, error_message, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.started_at,
        entry.completed_at,
        entry.duration_ms,
        entry.strategy,
        entry.outcome,
        entry.deltas_pushed,
        entry.deltas_pulled,
        entry.conflicts_resolved,
        entry.docs_upserted,
        entry.docs_deleted,
        entry.error_message,
        entry.device_id,
      )
  }

  async getSyncAuditLog(limit: number = 100): Promise<SyncAuditEntry[]> {
    return this.db.prepare("SELECT * FROM sync_audit ORDER BY started_at DESC LIMIT ?").all(limit) as SyncAuditEntry[]
  }

  async pruneSyncAudit(retentionMs: number, maxEntries: number): Promise<number> {
    let totalDeleted = 0

    // Delete entries older than retention period
    const cutoff = new Date(Date.now() - retentionMs).toISOString()
    const ageResult = this.db.prepare("DELETE FROM sync_audit WHERE started_at < ?").run(cutoff)
    totalDeleted += ageResult.changes

    // If still over limit, delete oldest excess
    const count = (this.db.prepare("SELECT COUNT(*) as count FROM sync_audit").get() as {count: number}).count
    if (count > maxEntries) {
      const excess = count - maxEntries
      const excessResult = this.db
        .prepare("DELETE FROM sync_audit WHERE id IN (SELECT id FROM sync_audit ORDER BY started_at ASC LIMIT ?)")
        .run(excess)
      totalDeleted += excessResult.changes
    }

    return totalDeleted
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
