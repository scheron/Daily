import type {Migration} from "../scripts/migrate"

/**
 * Adds the `task_comments` table. Shaped like `task_events` — one row per task, scoped to a
 * project — but mutable: a comment carries `updated_at` and `deleted_at` and merges by Last-Write-Wins,
 * where an event is appended once and never touched again.
 *
 * No `REFERENCES` to `tasks`, deliberately, for the reason `task_relations` has none: a comment can
 * reach this table through sync before its task does, and sync garbage collection removes task rows
 * on its own schedule.
 *
 * `origin` is null for a comment written by hand in the app, `mcp` for one an MCP server wrote and
 * `agent` for one the built-in agent wrote.
 */
export const v013: Migration = {
  version: 13,
  name: "task-comments",
  up: `
    CREATE TABLE task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      content TEXT NOT NULL,
      origin TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at);
    CREATE INDEX idx_task_comments_branch ON task_comments(branch_id);
  `,
  down: `
    DROP INDEX IF EXISTS idx_task_comments_branch;
    DROP INDEX IF EXISTS idx_task_comments_task;
    DROP TABLE IF EXISTS task_comments;
  `,
}
