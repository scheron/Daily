import type {Migration} from "../scripts/migrate"

export const v005: Migration = {
  version: 5,
  name: "task-events",
  up: `
    CREATE TABLE task_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      from_date TEXT,
      to_date TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_task_events_branch_date ON task_events(branch_id, event_date);
    CREATE INDEX idx_task_events_task ON task_events(task_id, created_at);

    ALTER TABLE ai_turns ADD COLUMN prompt_tokens INTEGER;
    ALTER TABLE ai_turns ADD COLUMN completion_tokens INTEGER;
    ALTER TABLE ai_turns ADD COLUMN total_tokens INTEGER;
  `,
  down: `
    ALTER TABLE ai_turns DROP COLUMN total_tokens;
    ALTER TABLE ai_turns DROP COLUMN completion_tokens;
    ALTER TABLE ai_turns DROP COLUMN prompt_tokens;

    DROP INDEX IF EXISTS idx_task_events_task;
    DROP INDEX IF EXISTS idx_task_events_branch_date;
    DROP TABLE IF EXISTS task_events;
  `,
}
