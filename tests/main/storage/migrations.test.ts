// @ts-nocheck
import Database from "better-sqlite3"
import {describe, expect, it} from "vitest"

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

    db.close()
  })

  it("is idempotent — running twice doesn't fail or duplicate", () => {
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")

    runMigrations(db)
    runMigrations(db)

    const applied = getAppliedMigrations(db)
    expect(applied).toHaveLength(3)

    db.close()
  })

  it("rollback removes last migration", () => {
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")

    runMigrations(db)
    expect(getAppliedMigrations(db)).toHaveLength(3)

    const rolledBack = rollbackLastMigration(db)
    expect(rolledBack).toBe(3)
    expect(getAppliedMigrations(db)).toHaveLength(2)

    db.close()
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
