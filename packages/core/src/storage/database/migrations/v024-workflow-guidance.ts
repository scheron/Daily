import type {Migration} from "../scripts/migrate"

export const v024: Migration = {
  version: 24,
  name: "workflow-guidance",
  up: `CREATE TABLE workflow_guidance_records (id TEXT PRIMARY KEY, data TEXT NOT NULL);`,
  down: `DROP TABLE workflow_guidance_records;`,
}
