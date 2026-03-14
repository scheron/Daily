/**
 * Pre-update data export for PouchDB → SQLite migration.
 *
 * THIS FILE is meant for the INTERMEDIATE PouchDB release.
 * It exports all PouchDB data to a JSON file before the app
 * quits for an update. The new SQLite version will import
 * this file on first launch.
 *
 * Integration point: UpdaterController.startInstall(), before app.quit()
 */
import path from "node:path"
import {app} from "electron"
import fs from "fs-extra"

import {logger} from "@/utils/logger"

const EXPORT_FILENAME = "migration-export.json"

/**
 * Export all PouchDB data to a JSON file for migration.
 * Called before app.quit() during an update.
 *
 * Usage in UpdaterController.startInstall():
 *   await exportDataForMigration(this.getStorageController)
 *   app.quit()
 */
export async function exportDataForMigration(getStorageController: (() => any) | null): Promise<void> {
  const appDataRoot = app.getPath("userData")
  const dbPath = path.join(appDataRoot, "db")
  const exportPath = path.join(appDataRoot, EXPORT_FILENAME)

  // Skip if PouchDB data doesn't exist
  if (!fs.existsSync(dbPath)) return

  // Skip if export already exists (don't overwrite)
  if (fs.existsSync(exportPath)) return

  try {
    // Dynamically import PouchDB to avoid issues if not available
    const PouchDB = (await import("pouchdb")).default

    const db = new PouchDB(dbPath)
    const result = await db.allDocs({
      include_docs: true,
      attachments: true,
      binary: false,
    })

    const tasks: any[] = []
    const tags: any[] = []
    const branches: any[] = []
    const files: any[] = []
    let settings: any = null

    for (const row of result.rows) {
      const doc = row.doc as any
      if (!doc || doc._deleted) continue

      switch (doc.type) {
        case "task":
          tasks.push(doc)
          break
        case "tag":
          tags.push(doc)
          break
        case "branch":
          branches.push(doc)
          break
        case "file":
          files.push(doc)
          break
        case "settings":
          settings = doc
          break
      }
    }

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks,
      tags,
      branches,
      files,
      settings,
    }

    await fs.writeFile(exportPath, JSON.stringify(exportData), "utf-8")
    await db.close()

    logger.info(
      "MIGRATION" as any,
      `Exported data for migration: ${tasks.length} tasks, ${tags.length} tags, ${branches.length} branches, ${files.length} files`,
    )
  } catch (err: any) {
    logger.error("MIGRATION" as any, "Failed to export data for migration", err)
    // Don't block the update — worst case the user starts fresh
  }
}
