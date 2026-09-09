import type {Migration} from "../scripts/migrate"

/**
 * Adds milestones: a named goal, scoped to a branch, that a task may optionally belong to.
 *
 * `tasks.milestone_id` is added with `ALTER TABLE ADD COLUMN` — the column is nullable and
 * carries no `NOT NULL`/`CHECK` constraint, so no rebuild of `tasks` is needed here.
 */
export const v011: Migration = {
  version: 11,
  name: "milestones",
  up: `
    CREATE TABLE milestones (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL REFERENCES branches(id),
      name TEXT NOT NULL,
      date TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_milestones_branch ON milestones(branch_id) WHERE deleted_at IS NULL;

    ALTER TABLE tasks ADD COLUMN milestone_id TEXT REFERENCES milestones(id);

    CREATE INDEX idx_tasks_milestone ON tasks(milestone_id) WHERE milestone_id IS NOT NULL;
  `,
  down: `
    DROP INDEX IF EXISTS idx_tasks_milestone;
    ALTER TABLE tasks DROP COLUMN milestone_id;
    DROP INDEX IF EXISTS idx_milestones_branch;
    DROP TABLE IF EXISTS milestones;
  `,
}
