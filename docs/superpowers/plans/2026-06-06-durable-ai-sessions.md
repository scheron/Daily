# Phase 5 — Durable AI Sessions

> **For agentic workers:** Use superpowers:executing-plans.

**Goal:** Persist AI sessions, turns, and steps to SQLite so conversations survive app restart and turn history is available for audit / Phase 8 compaction / Phase 9 evals. Renderer can lazily restore the last active session's last N turns into the chat view on mount.

**Architecture:**

- Migration `v004-ai-sessions` creates `ai_sessions`, `ai_turns`, `ai_steps` tables + indexes.
- `AISessionModel` (low-level SQLite CRUD): `createSession`, `getActiveSession`, `archiveSession`, `createTurn`, `updateTurn`, `appendStep`, `getSessionWithTurns(limit)`.
- `StorageController` exposes the necessary methods (`getActiveAiSession`, `archiveAiSession`, `appendAiTurn(turn)`).
- `AIController.sendMessage` persists the turn after success/failure/cancel using `TurnBuilder.snapshot()` → `StorageController.appendAiTurn(snapshot)`. Session is lazily created on first turn; reused across turns until `clearHistory()` archives it.
- `clearHistory()` archives the current session instead of just wiping the in-memory array. The in-memory `conversationHistory` array is still wiped — persistence is the audit trail.
- New IPC `ai:get-current-session` returns `{turns: AgentTurn[]}` (last 20 turns from the active session) for the renderer to repaint chat on mount.
- Renderer store calls `ai:get-current-session` once on mount and seeds `messages` from the resulting turns (using `finalMessage` + reconstructed `toolCalls` from each turn's steps).

**Tech Stack:** TypeScript, better-sqlite3, existing migration framework. No new dependencies.

**Spec source:** [agent-system-roadmap.md](../../agent-system-roadmap.md) — Phase 5.

---

## Task 0: Migration v004

- [ ] Create `src/main/storage/database/migrations/v004-ai-sessions.ts`:

```sql
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
```

- [ ] Add to `migrations/index.ts`.
- [ ] Migration test confirms tables exist.
- [ ] Commit.

---

## Task 1: AISessionModel

- [ ] Create `src/main/storage/models/AISessionModel.ts` with methods:
  - `getActiveSession(): {id, ...} | null`
  - `createSession(meta: {provider?, model?, promptTier?, title?}): {id, ...}`
  - `archiveSession(id): boolean`
  - `appendTurn(sessionId, turn: AgentTurn): void` — inserts turn row + every step row in one transaction
  - `getSessionTurns(sessionId, limit): AgentTurn[]` — joined load, steps reconstructed from `payload_json`

- [ ] Tests for each method.
- [ ] Commit.

---

## Task 2: Wire StorageController

- [ ] Add to `StorageController`:
  - `getActiveAiSession()` → reads via model.
  - `appendAiTurn(turn, sessionMeta)` → looks up or creates active session, appends turn.
  - `archiveActiveAiSession()` → archives if one exists.
  - `getActiveAiSessionTurns(limit = 20)` → snapshots for renderer restore.

- [ ] Commit.

---

## Task 3: AIController persists turns

- [ ] In `sendMessage` after the try/catch/finally, call `await this.storage.appendAiTurn(turn.snapshot(), {provider, model, promptTier})`.
- [ ] In `clearHistory()`, call `await this.storage.archiveActiveAiSession()` before clearing in-memory state. Note: must change `clearHistory` to async; update IPC handler signature too.
- [ ] Tests: confirm `appendAiTurn` called on success / failure / cancel; `archiveActiveAiSession` called on `clearHistory`.
- [ ] Commit.

---

## Task 4: IPC + renderer restore

- [ ] Add IPC `ai:get-current-session` → `Promise<{turns: AgentTurnSnapshot[]}>`. Define a small renderer-safe `AgentTurnSnapshot` type in shared (final_message + toolCalls list reconstructed from steps).
- [ ] Preload + `BridgeIPC` interface.
- [ ] Renderer `useAiStore` calls `ai:get-current-session` on mount and pre-populates `messages` (skipping if existing in-memory messages already present).
- [ ] Commit.

---

## Task 5: Full gate

- [ ] `pnpm lint`, `pnpm typecheck:all`, `pnpm test`, `pnpm circular`.

---

## Out of scope

- Multiple-session listing UI (`ai:list-sessions`). Adds renderer UI surface; defer until users ask.
- Per-step rich rendering in restored chat (skip pure tool steps, show only respond/final/error). The restored UI will render the final message + the tool-name list, matching what live turns render today.
