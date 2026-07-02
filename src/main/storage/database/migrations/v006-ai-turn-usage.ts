import type Database from "better-sqlite3"
import type {Migration} from "../scripts/migrate"

const USAGE_COLUMNS = ["prompt_tokens", "completion_tokens", "total_tokens"]

/**
 * Restores the token-usage columns on ai_turns as their own migration.
 *
 * Some databases already have these columns: v0.16.0 shipped them folded
 * into v005, and pre-release builds applied them under an orphaned v6.
 * Databases that ran the original v005 (task-events only) have none.
 * Both steps therefore check the live schema instead of assuming it.
 */
export const v006: Migration = {
  version: 6,
  name: "ai-turn-usage",
  up: (db) => {
    const existing = existingUsageColumns(db)
    for (const column of USAGE_COLUMNS) {
      if (!existing.has(column)) db.exec(`ALTER TABLE ai_turns ADD COLUMN ${column} INTEGER`)
    }
  },
  down: (db) => {
    const existing = existingUsageColumns(db)
    for (const column of [...USAGE_COLUMNS].reverse()) {
      if (existing.has(column)) db.exec(`ALTER TABLE ai_turns DROP COLUMN ${column}`)
    }
  },
}

function existingUsageColumns(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT name FROM pragma_table_info('ai_turns')").all() as {name: string}[]
  return new Set(rows.map((row) => row.name))
}
