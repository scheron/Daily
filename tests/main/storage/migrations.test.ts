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
    expect(applied).toHaveLength(1)

    db.close()
  })

  it("rollback removes last migration", () => {
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")

    runMigrations(db)
    expect(getAppliedMigrations(db)).toHaveLength(1)

    const rolledBack = rollbackLastMigration(db)
    expect(rolledBack).toBe(1)
    expect(getAppliedMigrations(db)).toHaveLength(0)

    // Tables should be dropped
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const names = tables.map((t) => t.name)
    expect(names).not.toContain("tasks")

    db.close()
  })
})
