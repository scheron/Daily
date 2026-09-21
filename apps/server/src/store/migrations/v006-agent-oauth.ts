import type {Migration} from "../migrate"

export const v006: Migration = {
  version: 6,
  name: "agent-oauth",
  up: `
    CREATE TABLE agent_authorizations (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE REFERENCES agent_requests(id),
      client_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      state TEXT,
      code_challenge TEXT NOT NULL,
      resource TEXT NOT NULL,
      created_at TEXT NOT NULL,
      code_hash TEXT UNIQUE,
      code_expires_at TEXT,
      code_used_at TEXT
    );

    CREATE TABLE agent_tokens (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      client_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      access_token_hash TEXT NOT NULL UNIQUE,
      access_expires_at TEXT NOT NULL,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      rotated_at TEXT
    );
    CREATE INDEX idx_agent_tokens_agent ON agent_tokens(agent_id);
  `,
}
