import type Database from "better-sqlite3"
import type {Migration} from "../scripts/migrate"

const USAGE_COLUMNS = ["prompt_tokens", "completion_tokens", "total_tokens"]

/**
 * Repairs databases whose _migrations history was poisoned by the
 * orphaned pre-release v5/v6: they record those versions as applied
 * while the schema has neither task_events nor the usage columns, so
 * v005/v006 never run for them. This pass recreates whatever is
 * missing and no-ops everywhere else.
 */
export const v007: Migration = {
  version: 7,
  name: "repair-activity-and-usage",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        type TEXT NOT NULL,
        event_date TEXT NOT NULL,
        from_date TEXT,
        to_date TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_events_branch_date ON task_events(branch_id, event_date);
      CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);
    `)

    const existing = existingAiTurnColumns(db)
    for (const column of USAGE_COLUMNS) {
      if (!existing.has(column)) db.exec(`ALTER TABLE ai_turns ADD COLUMN ${column} INTEGER`)
    }
  },
  down: () => {},
}

function existingAiTurnColumns(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT name FROM pragma_table_info('ai_turns')").all() as {name: string}[]
  return new Set(rows.map((row) => row.name))
}
