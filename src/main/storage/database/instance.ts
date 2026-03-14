import path from "node:path"
import Database from "better-sqlite3"
import fs from "fs-extra"

import {logger} from "@/utils/logger"

import {runMigrations} from "./scripts/migrate"

let db: Database.Database | null = null

export function initDatabase(dbPath: string): Database.Database {
  if (db) return db

  const dbDir = path.dirname(dbPath)
  fs.ensureDirSync(dbDir)

  logger.info(logger.CONTEXT.DB, `Initializing SQLite at: ${dbPath}`)

  const instance = new Database(dbPath)

  try {
    instance.pragma("journal_mode = WAL")
    instance.pragma("foreign_keys = ON")
    instance.pragma("busy_timeout = 5000")
    instance.pragma("synchronous = NORMAL")
    instance.pragma("journal_size_limit = 67108864")

    logger.info(logger.CONTEXT.DB, "Running migrations")
    runMigrations(instance)
  } catch (error) {
    instance.close()
    logger.error(logger.CONTEXT.DB, "Failed to initialize SQLite", error)
    throw error
  }

  db = instance
  logger.lifecycle("SQLite initialized successfully")

  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.")
  }
  return db
}

export function closeDatabase(): void {
  if (!db) return

  db.close()
  db = null

  logger.info(logger.CONTEXT.DB, "SQLite closed")
}
