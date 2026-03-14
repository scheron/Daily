import path from "node:path"
import fs from "fs-extra"

import {logger} from "@/utils/logger"

import {rowToFile} from "./_rowMappers"

import type {ID} from "@shared/types/common"
import type {File} from "@shared/types/storage"
import type Database from "better-sqlite3"

export class FileModel {
  constructor(
    private db: Database.Database,
    private assetsDir: string,
  ) {}

  initAssets(): void {
    fs.ensureDirSync(this.assetsDir)
  }

  async saveAsset(fileId: string, ext: string, data: Buffer): Promise<void> {
    await fs.writeFile(path.join(this.assetsDir, `${fileId}.${ext}`), data)
  }

  async readAssetBuffer(fileId: string, ext: string): Promise<Buffer> {
    return fs.readFile(path.join(this.assetsDir, `${fileId}.${ext}`))
  }

  async deleteAsset(fileId: string, ext: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.assetsDir, `${fileId}.${ext}`))
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error
    }
  }

  async listAssets(): Promise<string[]> {
    return fs.readdir(this.assetsDir)
  }

  async cleanupOrphanAssets(validFileIds: Set<string>): Promise<number> {
    const assets = await this.listAssets()
    let count = 0

    for (const asset of assets) {
      const dotIndex = asset.lastIndexOf(".")
      const fileId = dotIndex !== -1 ? asset.slice(0, dotIndex) : asset
      const ext = dotIndex !== -1 ? asset.slice(dotIndex + 1) : ""

      if (!validFileIds.has(fileId)) {
        await this.deleteAsset(fileId, ext)
        count++
      }
    }

    logger.info(logger.CONTEXT.FILES, `Cleaned up ${count} orphan assets`)
    return count
  }

  getAssetPath(fileId: string, ext: string): string {
    return path.join(this.assetsDir, `${fileId}.${ext}`)
  }

  getFileList(params?: {includeDeleted?: boolean}): File[] {
    let sql = `SELECT id, name, mime_type, size, created_at, updated_at, deleted_at FROM files`

    if (!params?.includeDeleted) {
      sql += ` WHERE deleted_at IS NULL`
    }

    const rows = this.db.prepare(sql).all() as any[]

    logger.info(logger.CONTEXT.FILES, `Loaded ${rows.length} files from database`)

    return rows.map(rowToFile)
  }

  getFiles(ids: ID[]): File[] {
    if (ids.length === 0) return []

    const placeholders = ids.map(() => "?").join(", ")
    const rows = this.db
      .prepare(
        `
      SELECT id, name, mime_type, size, created_at, updated_at, deleted_at
      FROM files WHERE id IN (${placeholders})
    `,
      )
      .all(...ids) as any[]

    logger.debug(logger.CONTEXT.FILES, `Retrieved ${rows.length}/${ids.length} files`)

    return rows.map(rowToFile)
  }

  createFile(id: ID, name: string, mimeType: string, size: number): File | null {
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
      INSERT INTO files (id, name, mime_type, size, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `,
      )
      .run(id, name, mimeType, size, now, now)

    logger.storage("Created", "FILES", id)
    return this.getFile(id)
  }

  getFile(id: ID): File | null {
    const row = this.db
      .prepare(
        `
      SELECT id, name, mime_type, size, created_at, updated_at, deleted_at FROM files WHERE id = ?
    `,
      )
      .get(id) as any

    if (!row) {
      logger.debug(logger.CONTEXT.FILES, `File not found: ${id}`)
      return null
    }

    return rowToFile(row)
  }

  deleteFile(id: ID): boolean {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `
      UPDATE files SET deleted_at = ?, updated_at = ? WHERE id = ?
    `,
      )
      .run(now, now, id)

    logger.storage("Deleted", "FILES", id)
    return result.changes > 0
  }

  getReferencedFileIds(): Set<ID> {
    const rows = this.db.prepare(`SELECT DISTINCT file_id FROM task_attachments`).all() as any[]
    return new Set(rows.map((row: any) => row.file_id))
  }
}
