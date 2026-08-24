import type {Migration} from "../scripts/migrate"

export const v004: Migration = {
  version: 4,
  name: "ai-sessions",
  up: `
    CREATE TABLE ai_sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      provider TEXT,
      model TEXT,
      prompt_tier TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE ai_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_message TEXT NOT NULL,
      status TEXT NOT NULL,
      final_message TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE ai_steps (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (turn_id) REFERENCES ai_turns(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_ai_turns_session_started ON ai_turns(session_id, started_at);
    CREATE INDEX idx_ai_steps_turn_created ON ai_steps(turn_id, created_at);
    CREATE INDEX idx_ai_sessions_active ON ai_sessions(archived_at) WHERE archived_at IS NULL;
  `,
  down: `
    DROP INDEX IF EXISTS idx_ai_sessions_active;
    DROP INDEX IF EXISTS idx_ai_steps_turn_created;
    DROP INDEX IF EXISTS idx_ai_turns_session_started;
    DROP TABLE IF EXISTS ai_steps;
    DROP TABLE IF EXISTS ai_turns;
    DROP TABLE IF EXISTS ai_sessions;
  `,
}
