import {migrations} from "../migrations"

import type Database from "better-sqlite3"

export type MigrationStep = string | ((db: Database.Database) => void)

export type Migration = {
  version: number
  name: string
  up: MigrationStep
  down: MigrationStep
}

export type MigrationRecord = {
  version: number
  name: string
  applied_at: string
}

export function runMigrations(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`)

  const applied = new Set((db.prepare("SELECT version FROM _migrations").all() as {version: number}[]).map((r) => r.version))

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    const transaction = db.transaction(() => {
      runStep(db, migration.up)
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
    runStep(db, migration.down)
    db.prepare("DELETE FROM _migrations WHERE version = ?").run(last.version)
  })
  transaction()

  return last.version
}

export function getAppliedMigrations(db: Database.Database): MigrationRecord[] {
  return db.prepare("SELECT version, name, applied_at FROM _migrations ORDER BY version ASC").all() as MigrationRecord[]
}

function runStep(db: Database.Database, step: MigrationStep) {
  if (typeof step === "string") db.exec(step)
  else step(db)
}
