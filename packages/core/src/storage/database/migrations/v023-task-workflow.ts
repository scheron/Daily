import type {Migration} from "../scripts/migrate"

export const v023: Migration = {
  version: 23,
  name: "task-workflow",
  up: `
    ALTER TABLE tasks ADD COLUMN workflow_time_baseline INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tasks ADD COLUMN workflow_generation TEXT NOT NULL DEFAULT '';
    CREATE TABLE workflow_records (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX workflow_records_task ON workflow_records(task_id);
  `,
  down: `DROP TABLE workflow_records; ALTER TABLE tasks DROP COLUMN workflow_time_baseline; ALTER TABLE tasks DROP COLUMN workflow_generation;`,
}
