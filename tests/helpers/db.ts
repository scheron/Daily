// @ts-nocheck
import Database from "better-sqlite3"

import {runMigrations} from "@main/storage/database/scripts/migrate"

export function createTestDatabase(): Database.Database {
  const db = new Database(":memory:")

  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  runMigrations(db)

  // Seed device_id so triggers can populate change_log.device_id (NOT NULL)
  db.prepare("INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('device_id', 'test-device-001')").run()

  return db
}
