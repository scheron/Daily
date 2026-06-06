import {nanoid} from "nanoid"

import {logger} from "@/utils/logger"

import type {AgentStep, AgentTurn, AgentTurnStatus} from "@/ai/turns/types"
import type Database from "better-sqlite3"

export type AiSessionRow = {
  id: string
  title: string | null
  provider: string | null
  model: string | null
  promptTier: string | null
  status: "active" | "archived"
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type SessionMeta = {
  provider?: string
  model?: string
  promptTier?: string
  title?: string
}

/**
 * Low-level SQLite CRUD for AI sessions, turns, and steps (Phase 5).
 *
 * The store-of-record for the assistant: every user turn that AIController
 * runs ends up as one row in `ai_turns` plus N rows in `ai_steps`. Sessions
 * exist as a grouping concept and are archived (not deleted) when the user
 * clears chat history.
 */
export class AISessionModel {
  constructor(private db: Database.Database) {}

  /** The single non-archived session, or null. */
  getActiveSession(): AiSessionRow | null {
    const row = this.db
      .prepare(
        `SELECT id, title, provider, model, prompt_tier AS promptTier, status,
                created_at AS createdAt, updated_at AS updatedAt, archived_at AS archivedAt
         FROM ai_sessions
         WHERE archived_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get() as AiSessionRow | undefined
    return row ?? null
  }

  createSession(meta: SessionMeta = {}): AiSessionRow {
    const id = nanoid()
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO ai_sessions (id, title, provider, model, prompt_tier, status, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, NULL)`,
      )
      .run(id, meta.title ?? null, meta.provider ?? null, meta.model ?? null, meta.promptTier ?? null, now, now)
    logger.info(logger.CONTEXT.AI, `AI session created: ${id}`)
    return this.getActiveSession()!
  }

  archiveSession(id: string): boolean {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(`UPDATE ai_sessions SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL`)
      .run(now, now, id)
    if (result.changes > 0) logger.info(logger.CONTEXT.AI, `AI session archived: ${id}`)
    return result.changes > 0
  }

  /**
   * Insert a turn and all of its steps in one transaction. The turn's status
   * may still be terminal at call time (completed / failed / cancelled).
   */
  appendTurn(sessionId: string, turn: AgentTurn): void {
    const insertTurn = this.db.prepare(
      `INSERT INTO ai_turns (id, session_id, user_message, status, final_message, error, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertStep = this.db.prepare(`INSERT INTO ai_steps (id, turn_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`)
    const touchSession = this.db.prepare(`UPDATE ai_sessions SET updated_at = ? WHERE id = ?`)

    const run = this.db.transaction(() => {
      insertTurn.run(
        turn.id,
        sessionId,
        turn.userMessage,
        turn.status,
        turn.finalMessage ?? null,
        turn.error ?? null,
        new Date(turn.startedAt).toISOString(),
        turn.finishedAt ? new Date(turn.finishedAt).toISOString() : null,
      )
      for (const step of turn.steps) {
        const {id, type, createdAt, ...payload} = step as any
        insertStep.run(id, turn.id, type, JSON.stringify(payload), new Date(createdAt).toISOString())
      }
      touchSession.run(new Date().toISOString(), sessionId)
    })

    run()
  }

  /**
   * Load the N most recent turns for a session, newest-first in storage, but
   * returned in chronological (oldest-first) order to match the in-memory
   * turn sequence.
   */
  getSessionTurns(sessionId: string, limit: number): AgentTurn[] {
    const turnRows = this.db
      .prepare(
        `SELECT id, user_message AS userMessage, status, final_message AS finalMessage, error,
                started_at AS startedAt, finished_at AS finishedAt
         FROM ai_turns
         WHERE session_id = ?
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(sessionId, limit) as Array<{
      id: string
      userMessage: string
      status: AgentTurnStatus
      finalMessage: string | null
      error: string | null
      startedAt: string
      finishedAt: string | null
    }>

    if (turnRows.length === 0) return []

    const stepStmt = this.db.prepare(
      `SELECT id, type, payload_json AS payloadJson, created_at AS createdAt FROM ai_steps WHERE turn_id = ? ORDER BY created_at ASC`,
    )

    const turns: AgentTurn[] = turnRows.reverse().map((row) => {
      const steps = stepStmt.all(row.id) as Array<{id: string; type: string; payloadJson: string; createdAt: string}>
      const parsedSteps = steps.map((s) => {
        let payload: Record<string, unknown> = {}
        try {
          payload = JSON.parse(s.payloadJson)
        } catch {
          payload = {}
        }
        return {id: s.id, type: s.type, createdAt: new Date(s.createdAt).getTime(), ...payload} as unknown as AgentStep
      })

      return {
        id: row.id,
        sessionId,
        userMessage: row.userMessage,
        status: row.status,
        finalMessage: row.finalMessage ?? undefined,
        error: row.error ?? undefined,
        startedAt: new Date(row.startedAt).getTime(),
        finishedAt: row.finishedAt ? new Date(row.finishedAt).getTime() : undefined,
        steps: parsedSteps,
      }
    })

    return turns
  }
}
