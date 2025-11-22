import path from "node:path"
import fs from "fs-extra"
import PouchDB from "pouchdb"
import PouchDBFind from "pouchdb-find"

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

        console.log(`📂 Initializing PouchDB at: ${dbPath}`)

        const db = new PouchDB(dbPath)

        console.log("🔨 Creating database indexes...")

        await createIndexes(db)

        dbInstance = db
        return db
      } catch (error) {
        console.error("❌ Failed to initialize PouchDB:", error)
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
  await db.createIndex({index: {fields: ["type", "status"]}})
  await db.createIndex({index: {fields: ["type", "createdAt"]}})
  await db.createIndex({index: {fields: ["type", "updatedAt"]}})

  console.log("✅ PouchDB initialized successfully with indexes")
}

export function getDBInstance(): DailyDB | null {
  return dbInstance
}

export async function closeDB(): Promise<void> {
  if (!dbInstance) return

  await dbInstance.close()

  dbInstance = null
  dbReadyPromise = null

  console.log("🔒 PouchDB closed")
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
    console.log("🗑️ PouchDB destroyed (active instance)")
    return
  }

  const db = new PouchDB(dbPath)
  await db.destroy()
  console.log("🗑️ PouchDB destroyed (fresh instance)")
}
