import type {Migration} from "../scripts/migrate"

/**
 * Adds the `subtasks` table: a checkbox with its own markdown inside one task. Merges by Last-Write-Wins
 * like a comment, and carries no project — it takes everything but its own text and mark from its task.
 *
 * No `REFERENCES` to `tasks`, for the reason `task_comments` has none: a subtask can reach this table
 * through sync before its task does. `order_key` sorts as plain text, so a move rewrites one row.
 */
export const v019: Migration = {
  version: 19,
  name: "subtasks",
  up: `
    CREATE TABLE subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      content TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      order_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_subtasks_task ON subtasks(task_id, order_key);
  `,
  down: `
    DROP INDEX IF EXISTS idx_subtasks_task;
    DROP TABLE IF EXISTS subtasks;
  `,
}
