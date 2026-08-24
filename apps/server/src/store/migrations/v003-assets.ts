import type {Migration} from "../migrate"

export const v003: Migration = {
  version: 3,
  name: "assets",
  up: `
    CREATE TABLE assets (
      name TEXT PRIMARY KEY,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      uploaded_by_device_id TEXT REFERENCES devices(id)
    );
  `,
}
