import type {Migration} from "../migrate"

export const v002: Migration = {
  version: 2,
  name: "snapshot",
  up: `
    CREATE TABLE snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL,
      version INTEGER NOT NULL,
      hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      written_by_device_id TEXT REFERENCES devices(id),
      written_at TEXT NOT NULL,
      document TEXT NOT NULL
    );
  `,
}
