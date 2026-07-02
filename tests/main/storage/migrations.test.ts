// @ts-nocheck
import Database from "better-sqlite3"
import {describe, expect, it} from "vitest"

import {migrations} from "@main/storage/database/migrations"
import {getAppliedMigrations, rollbackLastMigration, runMigrations} from "@main/storage/database/scripts/migrate"

describe("migrations", () => {
  it("applies all migrations on a fresh database", () => {
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")

    runMigrations(db)

    const applied = getAppliedMigrations(db)
    expect(applied.length).toBeGreaterThan(0)
    expect(applied[0].name).toBe("initial-schema")

    // Verify core tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
    const names = tables.map((t) => t.name)
    expect(names).toContain("tasks")
    expect(names).toContain("tags")
    expect(names).toContain("branches")
    expect(names).toContain("settings")
    expect(names).toContain("task_tags")
    expect(names).toContain("task_attachments")
    expect(names).toContain("files")
    expect(names).toContain("task_events")

    db.close()
  })

  it("v005 task_events carries move columns from_date and to_date", () => {
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")
    runMigrations(db)

    const cols = db
      .prepare("PRAGMA table_info(task_events)")
      .all()
      .map((c) => c.name)
    expect(cols).toContain("from_date")
    expect(cols).toContain("to_date")
    expect(cols).not.toContain("task_title")

    db.close()
  })

  it("upgrades an existing v4 database by adding task_events", () => {
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")

    // Seed the DB as a user stuck on v4 (before the activity feed).
    db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
    for (const migration of migrations.filter((m) => m.version <= 4)) {
      db.exec(migration.up)
      db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        "2026-01-01T00:00:00.000Z",
      )
    }

    const tablesBefore = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((t) => t.name)
    expect(tablesBefore).not.toContain("task_events")

    runMigrations(db)

    const tablesAfter = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((t) => t.name)
    expect(tablesAfter).toContain("task_events")
    expect(getAppliedMigrations(db).map((m) => m.version)).toEqual(migrations.map((m) => m.version))

    db.close()
  })

  it("is idempotent — running twice doesn't fail or duplicate", () => {
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")

    runMigrations(db)
    runMigrations(db)

    const applied = getAppliedMigrations(db)
    expect(applied).toHaveLength(migrations.length)

    db.close()
  })

  it("rollback removes last migration", () => {
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")

    runMigrations(db)
    expect(getAppliedMigrations(db)).toHaveLength(migrations.length)

    const rolledBack = rollbackLastMigration(db)
    expect(rolledBack).toBe(migrations[migrations.length - 1].version)
    expect(getAppliedMigrations(db)).toHaveLength(migrations.length - 1)

    db.close()
  })

  describe("v004 — ai sessions", () => {
    it("creates ai_sessions, ai_turns, ai_steps tables with indexes", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tables).toContain("ai_sessions")
      expect(tables).toContain("ai_turns")
      expect(tables).toContain("ai_steps")

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all()
        .map((i) => i.name)
      expect(indexes).toContain("idx_ai_turns_session_started")
      expect(indexes).toContain("idx_ai_steps_turn_created")
      expect(indexes).toContain("idx_ai_sessions_active")

      db.close()
    })

    it("cascade deletes turns and steps when session is deleted", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      const now = new Date().toISOString()
      db.prepare("INSERT INTO ai_sessions (id, status, created_at, updated_at) VALUES ('s1', 'active', ?, ?)").run(now, now)
      db.prepare("INSERT INTO ai_turns (id, session_id, user_message, status, started_at) VALUES ('t1', 's1', 'hi', 'completed', ?)").run(now)
      db.prepare("INSERT INTO ai_steps (id, turn_id, type, payload_json, created_at) VALUES ('st1', 't1', 'respond', '{}', ?)").run(now)

      db.prepare("DELETE FROM ai_sessions WHERE id = 's1'").run()

      expect(db.prepare("SELECT COUNT(*) as c FROM ai_turns").get().c).toBe(0)
      expect(db.prepare("SELECT COUNT(*) as c FROM ai_steps").get().c).toBe(0)

      db.close()
    })
  })

  describe("v006 — ai turn usage", () => {
    function seedThroughV5(db) {
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 5)) {
        db.exec(migration.up)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-06-01T00:00:00.000Z",
        )
      }
    }

    function usageColumns(db) {
      return db
        .prepare("PRAGMA table_info(ai_turns)")
        .all()
        .map((c) => c.name)
        .filter((name) => ["prompt_tokens", "completion_tokens", "total_tokens"].includes(name))
    }

    it("fresh database gets the usage columns", () => {
      const db = new Database(":memory:")
      runMigrations(db)

      expect(usageColumns(db)).toHaveLength(3)

      db.close()
    })

    it("adds the columns to a database that ran the original v005 without them", () => {
      const db = new Database(":memory:")
      seedThroughV5(db)
      expect(usageColumns(db)).toHaveLength(0)

      runMigrations(db)

      expect(usageColumns(db)).toHaveLength(3)
      expect(getAppliedMigrations(db).map((m) => m.version)).toContain(6)

      db.close()
    })

    it("does not fail on a database where v0.16.0 already added the columns via v005", () => {
      const db = new Database(":memory:")
      seedThroughV5(db)
      db.exec(`
        ALTER TABLE ai_turns ADD COLUMN prompt_tokens INTEGER;
        ALTER TABLE ai_turns ADD COLUMN completion_tokens INTEGER;
        ALTER TABLE ai_turns ADD COLUMN total_tokens INTEGER;
      `)

      expect(() => runMigrations(db)).not.toThrow()

      expect(usageColumns(db)).toHaveLength(3)
      expect(getAppliedMigrations(db).map((m) => m.version)).toContain(6)

      db.close()
    })

    it("rollback drops the usage columns", () => {
      const db = new Database(":memory:")
      runMigrations(db)

      const rolledBack = rollbackLastMigration(db)

      expect(rolledBack).toBe(6)
      expect(usageColumns(db)).toHaveLength(0)

      db.close()
    })
  })

  describe("v003 — remove delta sync", () => {
    it("drops change_log table", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tables).not.toContain("change_log")

      db.close()
    })

    it("drops all 17 triggers", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all()
      expect(triggers).toHaveLength(0)

      db.close()
    })

    it("drops sync_audit table", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tables).not.toContain("sync_audit")

      db.close()
    })

    it("drops sync_meta table", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tables).not.toContain("sync_meta")

      db.close()
    })

    it("does not affect tasks, tags, branches, files, settings tables", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tables).toContain("tasks")
      expect(tables).toContain("tags")
      expect(tables).toContain("branches")
      expect(tables).toContain("files")
      expect(tables).toContain("settings")
      expect(tables).toContain("task_tags")
      expect(tables).toContain("task_attachments")

      db.close()
    })

    it("existing data survives migration", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      // Insert data
      const now = new Date().toISOString()
      db.prepare(
        "INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at) VALUES ('t1', 'active', 'Test', 0, 0, '2026-03-25', '', 'UTC', 0, 0, 'main', ?, ?)",
      ).run(now, now)
      db.prepare("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES ('tag1', 'work', '#ff0000', ?, ?)").run(now, now)

      // Verify data persists
      expect(db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()).toBeDefined()
      expect(db.prepare("SELECT * FROM tags WHERE id = 'tag1'").get()).toBeDefined()

      db.close()
    })
  })
})
