import {migrations} from "../migrations"

import type Database from "better-sqlite3"

export type Migration = {
  version: number
  name: string
  up: string
  down: string
}

export type MigrationRecord = {
  version: number
  name: string
  applied_at: string
}

export function runMigrations(db: Database.Database): void {
  // Create _migrations table if not exists
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`)

  // Get applied versions
  const applied = new Set((db.prepare("SELECT version FROM _migrations").all() as {version: number}[]).map((r) => r.version))

  // Apply pending migrations in order
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    const transaction = db.transaction(() => {
      db.exec(migration.up)
      db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      )
    })
    transaction()
  }
}

export function rollbackLastMigration(db: Database.Database): number | null {
  const last = db.prepare("SELECT version, name FROM _migrations ORDER BY version DESC LIMIT 1").get() as MigrationRecord | undefined
  if (!last) return null

  const migration = migrations.find((m) => m.version === last.version)
  if (!migration) return null

  const transaction = db.transaction(() => {
    db.exec(migration.down)
    db.prepare("DELETE FROM _migrations WHERE version = ?").run(last.version)
  })
  transaction()

  return last.version
}

export function getAppliedMigrations(db: Database.Database): MigrationRecord[] {
  return db.prepare("SELECT version, name, applied_at FROM _migrations ORDER BY version ASC").all() as MigrationRecord[]
}
