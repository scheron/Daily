import type {Migration} from "../scripts/migrate"

export const v021: Migration = {
  version: 21,
  name: "task-event-changes",
  up: `
    ALTER TABLE task_events ADD COLUMN from_status TEXT;
    ALTER TABLE task_events ADD COLUMN to_status TEXT;
    ALTER TABLE task_events ADD COLUMN from_priority TEXT;
    ALTER TABLE task_events ADD COLUMN to_priority TEXT;
    ALTER TABLE task_events ADD COLUMN from_branch_id TEXT;
    ALTER TABLE task_events ADD COLUMN to_branch_id TEXT;
    ALTER TABLE task_events ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE task_events ADD COLUMN move_id TEXT;
  `,
  down: `
    ALTER TABLE task_events DROP COLUMN move_id;
    ALTER TABLE task_events DROP COLUMN sequence;
    ALTER TABLE task_events DROP COLUMN to_branch_id;
    ALTER TABLE task_events DROP COLUMN from_branch_id;
    ALTER TABLE task_events DROP COLUMN to_priority;
    ALTER TABLE task_events DROP COLUMN from_priority;
    ALTER TABLE task_events DROP COLUMN to_status;
    ALTER TABLE task_events DROP COLUMN from_status;
  `,
}
