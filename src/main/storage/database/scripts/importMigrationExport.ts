import path from "node:path"
import fs from "fs-extra"

import {logger} from "@/utils/logger"

import type Database from "better-sqlite3"

const EXPORT_FILENAME = "migration-export.json"

type MigrationExport = {
  version: 1
  exportedAt: string
  tasks: any[]
  tags: any[]
  branches: any[]
  files: any[]
  settings: any | null
}

/**
 * Check if a migration export file exists from the old PouchDB version.
 */
export function hasMigrationExport(appDataRoot: string): boolean {
  return fs.existsSync(path.join(appDataRoot, EXPORT_FILENAME))
}

/**
 * Import data from the migration export JSON file into SQLite.
 * The export file is created by the old PouchDB version before an update.
 *
 * Flow:
 * 1. Read and parse the export file
 * 2. Insert all data into SQLite in a single transaction
 * 3. Extract file assets (base64 → disk)
 * 4. Delete the export file
 * 5. Delete the old PouchDB directory
 */
export async function importMigrationExport(appDataRoot: string, sqliteDb: Database.Database, assetsDir: string): Promise<void> {
  const exportPath = path.join(appDataRoot, EXPORT_FILENAME)

  logger.info(logger.CONTEXT.STORAGE, "Found migration export, importing data from PouchDB export")

  const raw = await fs.readFile(exportPath, "utf-8")
  const data: MigrationExport = JSON.parse(raw)

  if (data.version !== 1) {
    logger.warn(logger.CONTEXT.STORAGE, `Unknown migration export version: ${data.version}, skipping`)
    return
  }

  await fs.ensureDir(assetsDir)

  const now = new Date().toISOString()

  const insertAll = sqliteDb.transaction(() => {
    // 1. Branches
    const insertBranch = sqliteDb.prepare("INSERT OR IGNORE INTO branches (id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)")
    const knownBranchIds = new Set<string>(["main"])
    for (const doc of data.branches) {
      const id = stripPrefix(doc._id)
      insertBranch.run(id, doc.name, doc.createdAt, doc.updatedAt, doc.deletedAt ?? null)
      knownBranchIds.add(id)
    }

    // Ensure branches referenced by tasks exist
    for (const doc of data.tasks) {
      const branchId = doc.branchId || "main"
      if (!knownBranchIds.has(branchId)) {
        insertBranch.run(branchId, branchId, now, now, null)
        knownBranchIds.add(branchId)
      }
    }

    // 2. Tags
    const insertTag = sqliteDb.prepare("INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)")
    const validTagIds = new Set<string>()
    for (const doc of data.tags) {
      const id = stripPrefix(doc._id)
      insertTag.run(id, doc.name, doc.color, doc.createdAt, doc.updatedAt, doc.deletedAt ?? null)
      validTagIds.add(id)
    }

    // 3. Files (metadata)
    const insertFile = sqliteDb.prepare(
      "INSERT OR IGNORE INTO files (id, name, mime_type, size, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    const validFileIds = new Set<string>()
    for (const doc of data.files) {
      const id = stripPrefix(doc._id)
      insertFile.run(id, doc.name, doc.mimeType, doc.size ?? 0, doc.createdAt, doc.updatedAt, doc.deletedAt ?? null)
      validFileIds.add(id)
    }

    // 4. Tasks + task_tags + task_attachments
    const insertTask = sqliteDb.prepare(
      `INSERT OR IGNORE INTO tasks (id, status, content, minimized, order_index,
        scheduled_date, scheduled_time, scheduled_timezone,
        estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertTaskTag = sqliteDb.prepare("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)")
    const insertTaskAttachment = sqliteDb.prepare("INSERT OR IGNORE INTO task_attachments (task_id, file_id) VALUES (?, ?)")

    for (const doc of data.tasks) {
      const id = stripPrefix(doc._id)
      const branchId = doc.branchId || "main"
      const minimized = doc.minimized ? 1 : 0
      const orderIndex = typeof doc.orderIndex === "number" && Number.isFinite(doc.orderIndex) ? doc.orderIndex : Date.parse(doc.createdAt)

      insertTask.run(
        id,
        doc.status,
        doc.content ?? "",
        minimized,
        orderIndex,
        doc.scheduled?.date ?? "",
        doc.scheduled?.time ?? "",
        doc.scheduled?.timezone ?? "",
        doc.estimatedTime ?? 0,
        doc.spentTime ?? 0,
        branchId,
        doc.createdAt,
        doc.updatedAt,
        doc.deletedAt ?? null,
      )

      if (Array.isArray(doc.tags)) {
        for (const tagId of doc.tags) {
          if (tagId && validTagIds.has(tagId)) {
            insertTaskTag.run(id, tagId)
          }
        }
      }

      if (Array.isArray(doc.attachments)) {
        for (const fileId of doc.attachments) {
          if (fileId && validFileIds.has(fileId)) {
            insertTaskAttachment.run(id, fileId)
          }
        }
      }
    }

    // 5. Settings
    if (data.settings) {
      const settingsData = data.settings.data ?? data.settings
      const version = settingsData?.version || "migrated"
      sqliteDb
        .prepare("INSERT OR REPLACE INTO settings (id, version, data, created_at, updated_at) VALUES ('default', ?, ?, ?, ?)")
        .run(version, JSON.stringify(settingsData), data.settings.createdAt ?? now, data.settings.updatedAt ?? now)
    }
  })

  insertAll()

  // Extract file assets (base64 → disk)
  for (const doc of data.files) {
    const id = stripPrefix(doc._id)
    try {
      const attachment = doc._attachments?.data
      if (attachment?.data) {
        const ext = path.extname(doc.name).slice(1) || "bin"
        const buffer = Buffer.from(attachment.data, "base64")
        await fs.writeFile(path.join(assetsDir, `${id}.${ext}`), buffer)
      }
    } catch (err: any) {
      logger.warn(logger.CONTEXT.STORAGE, `Failed to extract file asset ${id}: ${err.message}`)
    }
  }

  // Cleanup: delete export file
  await fs.remove(exportPath)

  // Cleanup: delete old PouchDB directory
  const oldDbPath = path.join(appDataRoot, "db")
  const pouchFiles = ["LOG", "LOG.old", "LOCK", "CURRENT", "MANIFEST-000001"]
  const hasPouchFiles = pouchFiles.some((f) => fs.existsSync(path.join(oldDbPath, f)))
  if (hasPouchFiles) {
    // Only delete PouchDB-specific files, keep the db/ directory (SQLite is there too)
    for (const f of pouchFiles) {
      await fs.remove(path.join(oldDbPath, f)).catch(() => {})
    }
    // Delete LevelDB numbered files
    const entries = await fs.readdir(oldDbPath).catch(() => [])
    for (const entry of entries) {
      if (/^\d+\.(log|ldb|sst)$/.test(entry)) {
        await fs.remove(path.join(oldDbPath, entry)).catch(() => {})
      }
    }
    logger.info(logger.CONTEXT.STORAGE, "Cleaned up old PouchDB files")
  }

  logger.info(logger.CONTEXT.STORAGE, "Migration import completed successfully")
}

function stripPrefix(id: string): string {
  const idx = id.indexOf(":")
  return idx >= 0 ? id.slice(idx + 1) : id
}
