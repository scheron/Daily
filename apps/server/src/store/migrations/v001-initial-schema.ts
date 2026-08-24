import type {Migration} from "../migrate"

export const v001: Migration = {
  version: 1,
  name: "initial-schema",
  up: `
    CREATE TABLE server_identity (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      claimed_at TEXT,
      claim_code TEXT,
      claim_attempts INTEGER NOT NULL DEFAULT 0,
      claim_locked_at TEXT
    );

    CREATE TABLE devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT,
      revoked_at TEXT
    );

    CREATE TABLE enrollment_requests (
      id TEXT PRIMARY KEY,
      device_name TEXT NOT NULL,
      code TEXT NOT NULL,
      poll_token_hash TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      resolved_at TEXT,
      approved_by_device_id TEXT REFERENCES devices(id),
      issued_device_id TEXT REFERENCES devices(id),
      issued_token TEXT
    );

    CREATE TABLE console_enrollments (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      issued_device_id TEXT REFERENCES devices(id)
    );
  `,
}
