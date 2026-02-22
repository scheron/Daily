import path from "node:path"
import fs from "fs-extra"
import PouchDB from "pouchdb"
import PouchDBFind from "pouchdb-find"

import {logger} from "@/utils/logger"

PouchDB.plugin(PouchDBFind)

export type DailyDB = PouchDB.Database

let dbInstance: DailyDB | null = null
let dbReadyPromise: Promise<DailyDB> | null = null

export function getDB(dbPath: string): Promise<DailyDB> {
  if (!dbReadyPromise) {
    dbReadyPromise = (async () => {
      try {
        const dbDir = path.dirname(dbPath)
        await fs.ensureDir(dbDir)

        logger.info(logger.CONTEXT.DB, `Initializing PouchDB at: ${dbPath}`)

        const db = new PouchDB(dbPath)

        logger.info(logger.CONTEXT.DB, "Creating database indexes")

        await createIndexes(db)

        dbInstance = db
        return db
      } catch (error) {
        logger.error(logger.CONTEXT.DB, "Failed to initialize PouchDB", error)
        dbReadyPromise = null
        throw error
      }
    })()
  }

  return dbReadyPromise
}

async function createIndexes(db: DailyDB) {
  await db.createIndex({index: {fields: ["type"]}})
  await db.createIndex({index: {fields: ["type", "scheduled.date"]}})
  await db.createIndex({index: {fields: ["type", "branchId"]}})
  await db.createIndex({index: {fields: ["type", "branchId", "scheduled.date"]}})
  await db.createIndex({index: {fields: ["type", "status"]}})
  await db.createIndex({index: {fields: ["type", "createdAt"]}})
  await db.createIndex({index: {fields: ["type", "updatedAt"]}})

  logger.lifecycle("PouchDB initialized successfully with indexes")
}

export function getDBInstance(): DailyDB | null {
  return dbInstance
}

export async function closeDB(): Promise<void> {
  if (!dbInstance) return

  await dbInstance.close()

  dbInstance = null
  dbReadyPromise = null

  logger.info(logger.CONTEXT.DB, "PouchDB closed")
}

/**
 * Destroy the database (delete all data).
 * ⚠️ WARNING: This is a destructive operation!
 */
export async function destroyDB(dbPath: string): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy()
    dbInstance = null
    dbReadyPromise = null
    logger.warn(logger.CONTEXT.DB, "PouchDB destroyed (active instance)")
    return
  }

  const db = new PouchDB(dbPath)
  await db.destroy()
  logger.warn(logger.CONTEXT.DB, "PouchDB destroyed (fresh instance)")
}
