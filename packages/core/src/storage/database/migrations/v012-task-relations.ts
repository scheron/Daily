import type {Migration} from "../scripts/migrate"

/**
 * Adds the `task_relations` table. No `REFERENCES` to `tasks`, deliberately: a relation can reach
 * this table through sync before its tasks do, and sync garbage collection removes task rows on
 * its own schedule, so integrity is held by the rules, the merge and `deleteDocs` rather than by
 * the schema.
 */
export const v012: Migration = {
  version: 12,
  name: "task-relations",
  up: `
    CREATE TABLE task_relations (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_task_relations_blocker_id ON task_relations(blocker_id);
    CREATE INDEX idx_task_relations_blocked_id ON task_relations(blocked_id);
  `,
  down: `DROP TABLE IF EXISTS task_relations;`,
}
