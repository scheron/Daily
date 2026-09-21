import type {Migration} from "../migrate"

export const v005: Migration = {
  version: 5,
  name: "agents",
  up: `
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    );
    CREATE INDEX idx_agents_device ON agents(device_id);

    CREATE TABLE agent_requests (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id),
      code TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      returns_to TEXT NOT NULL,
      is_local_program INTEGER NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      resolved_at TEXT,
      issued_agent_id TEXT REFERENCES agents(id)
    );

    ALTER TABLE server_identity ADD COLUMN agent_window_expires_at TEXT;
    ALTER TABLE server_identity ADD COLUMN agent_window_device_id TEXT;
    ALTER TABLE devices ADD COLUMN time_zone TEXT;
  `,
}
