// @ts-nocheck
import Database from "better-sqlite3"
import {beforeEach, describe, expect, it} from "vitest"

import {runMigrations} from "@main/storage/database/scripts/migrate"
import {AISessionModel} from "@main/storage/models/AISessionModel"

function freshDb() {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  runMigrations(db)
  return db
}

function sampleTurn(overrides: Partial<any> = {}) {
  const id = overrides.id ?? "turn-1"
  return {
    id,
    userMessage: "hi",
    status: "completed" as const,
    finalMessage: "Done.",
    startedAt: Date.now(),
    finishedAt: Date.now() + 100,
    steps: [
      {id: `${id}-s1`, type: "model_response", createdAt: Date.now(), message: {role: "assistant", content: null}},
      {id: `${id}-s2`, type: "respond", createdAt: Date.now(), text: "Done."},
    ],
    ...overrides,
  }
}

describe("AISessionModel", () => {
  let db: Database.Database
  let model: AISessionModel

  beforeEach(() => {
    db = freshDb()
    model = new AISessionModel(db)
  })

  it("returns null when no session exists", () => {
    expect(model.getActiveSession()).toBeNull()
  })

  it("creates a session and finds it as active", () => {
    const s = model.createSession({provider: "openai", model: "gpt-4o", promptTier: "large"})
    expect(s.status).toBe("active")
    expect(model.getActiveSession()?.id).toBe(s.id)
  })

  it("archives a session — getActiveSession returns null afterwards", () => {
    const s = model.createSession()
    expect(model.archiveSession(s.id)).toBe(true)
    expect(model.getActiveSession()).toBeNull()
  })

  it("archiveSession is a no-op for already-archived sessions", () => {
    const s = model.createSession()
    model.archiveSession(s.id)
    expect(model.archiveSession(s.id)).toBe(false)
  })

  it("appendTurn persists turn and steps; getSessionTurns reads them back", () => {
    const s = model.createSession()
    model.appendTurn(s.id, sampleTurn())
    const turns = model.getSessionTurns(s.id, 10)
    expect(turns).toHaveLength(1)
    expect(turns[0].userMessage).toBe("hi")
    expect(turns[0].finalMessage).toBe("Done.")
    expect(turns[0].steps).toHaveLength(2)
    expect(turns[0].steps[1].type).toBe("respond")
    expect(turns[0].steps[1].text).toBe("Done.")
  })

  it("getSessionTurns returns chronological order even when persisted out of order", () => {
    const s = model.createSession()
    const t1 = sampleTurn({id: "a", startedAt: 1000, finishedAt: 1100, userMessage: "first"})
    const t2 = sampleTurn({id: "b", startedAt: 2000, finishedAt: 2100, userMessage: "second"})
    model.appendTurn(s.id, t2)
    model.appendTurn(s.id, t1)
    const turns = model.getSessionTurns(s.id, 10)
    expect(turns.map((t) => t.userMessage)).toEqual(["first", "second"])
  })

  it("respects the limit on getSessionTurns", () => {
    const s = model.createSession()
    for (let i = 0; i < 5; i++) {
      model.appendTurn(s.id, sampleTurn({id: `turn-${i}`, startedAt: i * 1000, finishedAt: i * 1000 + 100}))
    }
    expect(model.getSessionTurns(s.id, 3)).toHaveLength(3)
  })
})
