import type Database from "better-sqlite3"

export type MigrationStep = string | ((db: Database.Database) => void)

export type Migration = {
  version: number
  name: string
  up: MigrationStep
}

/** Applies every migration in `migrations` that is not yet recorded in `_migrations`, each inside its own transaction. */
export function runMigrations(db: Database.Database, migrations: Migration[]): void {
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

function runStep(db: Database.Database, step: MigrationStep) {
  if (typeof step === "string") db.exec(step)
  else step(db)
}
