// @ts-nocheck
import Database from "better-sqlite3"

import {runMigrations} from "@main/storage/database/scripts/migrate"

export function createTestDatabase(): Database.Database {
  const db = new Database(":memory:")

  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  runMigrations(db)

  return db
}
