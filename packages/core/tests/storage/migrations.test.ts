// @ts-nocheck
import {mkdtempSync, rmSync} from "node:fs"
import Database from "better-sqlite3"
import {describe, expect, it} from "vitest"

import {APP_CONFIG} from "@daily/protocol"

import {migrations} from "../../src/storage/database/migrations"
import {getAppliedMigrations, rollbackLastMigration, runMigrations} from "../../src/storage/database/scripts/migrate"

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

    it("rollback of v006 drops the usage columns", () => {
      const db = new Database(":memory:")
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 15)) {
        if (typeof migration.up === "string") db.exec(migration.up)
        else migration.up(db)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-01-01T00:00:00.000Z",
        )
      }

      rollbackLastMigration(db) // v015
      rollbackLastMigration(db) // v014
      rollbackLastMigration(db) // v013
      rollbackLastMigration(db) // v012
      rollbackLastMigration(db) // v011
      rollbackLastMigration(db) // v010
      rollbackLastMigration(db) // v009
      rollbackLastMigration(db) // v008
      rollbackLastMigration(db) // v007
      const rolledBack = rollbackLastMigration(db) // v006

      expect(rolledBack).toBe(6)
      expect(usageColumns(db)).toHaveLength(0)

      db.close()
    })
  })

  describe("v007 — repair poisoned migration history", () => {
    it("recreates task_events and usage columns when _migrations claims v5/v6 but the schema lacks them", () => {
      const db = new Database(":memory:")
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 4)) {
        db.exec(migration.up)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-06-01T00:00:00.000Z",
        )
      }
      db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (5, 'task-events', '2026-06-15T00:00:00.000Z')").run()
      db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (6, 'ai-turn-usage', '2026-06-15T00:00:00.000Z')").run()

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

      const cols = db
        .prepare("PRAGMA table_info(ai_turns)")
        .all()
        .map((c) => c.name)
      expect(cols).toContain("prompt_tokens")
      expect(cols).toContain("completion_tokens")
      expect(cols).toContain("total_tokens")

      db.close()
    })

    it("no-ops on a healthy database", () => {
      const db = new Database(":memory:")
      runMigrations(db)

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_events'")
        .all()
        .map((i) => i.name)
      expect(indexes).toContain("idx_task_events_branch_date")
      expect(indexes).toContain("idx_task_events_task")
      expect(getAppliedMigrations(db).map((m) => m.version)).toEqual(migrations.map((m) => m.version))

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

      db.close()
    })

    it("existing data survives migration", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      // Insert data
      const now = new Date().toISOString()
      db.prepare(
        "INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at) VALUES ('t1', 'in_progress', 'Test', 0, 0, '2026-03-25', '', 'UTC', 0, 0, 'main', ?, ?)",
      ).run(now, now)
      db.prepare("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES ('tag1', 'work', '#ff0000', ?, ?)").run(now, now)

      // Verify data persists
      expect(db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()).toBeDefined()
      expect(db.prepare("SELECT * FROM tags WHERE id = 'tag1'").get()).toBeDefined()

      db.close()
    })
  })

  describe("v009 — remove ssh sync settings", () => {
    function seedSyncRow(data: string) {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 8)) {
        if (typeof migration.up === "string") db.exec(migration.up)
        else migration.up(db)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-01-01T00:00:00.000Z",
        )
      }
      db.prepare("INSERT INTO device_settings (id, data, updated_at) VALUES ('sync', ?, ?)").run(data, "2026-01-01T00:00:00.000Z")
      return db
    }

    function readSyncData(db) {
      return db.prepare("SELECT data FROM device_settings WHERE id = 'sync'").get().data
    }

    it("removes_TC-4_only_the_ssh_key_from_a_sync_row_and_leaves_ssh_free_and_invalid_json_rows_byte_identical", () => {
      const withSsh = seedSyncRow(JSON.stringify({iCloud: {enabled: true}, ssh: {host: "example.com", enabled: true}}))
      runMigrations(withSsh)
      expect(readSyncData(withSsh)).toBe(JSON.stringify({iCloud: {enabled: true}}))
      withSsh.close()

      const withoutSsh = seedSyncRow(JSON.stringify({iCloud: {enabled: false}}))
      const beforeWithoutSsh = readSyncData(withoutSsh)
      runMigrations(withoutSsh)
      expect(readSyncData(withoutSsh)).toBe(beforeWithoutSsh)
      withoutSsh.close()

      const invalidJson = seedSyncRow("{not valid json")
      const beforeInvalid = readSyncData(invalidJson)
      expect(() => runMigrations(invalidJson)).not.toThrow()
      expect(readSyncData(invalidJson)).toBe(beforeInvalid)
      invalidJson.close()
    })
  })

  describe("v010 — backlog status", () => {
    function seedThroughV9(db) {
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 9)) {
        if (typeof migration.up === "string") db.exec(migration.up)
        else migration.up(db)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-01-01T00:00:00.000Z",
        )
      }
    }

    function seedTaskWithAssociations(db) {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
         VALUES ('t1', 'active', 'Keep me', 0, 1024, '2026-03-24', '10:00:00', 'UTC', 0, 0, 'main', ?, ?)`,
      ).run(now, now)
      db.prepare("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES ('tag1', 'urgent', '#ff0000', ?, ?)").run(now, now)
      db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES ('t1', 'tag1')").run()
      db.prepare("INSERT INTO files (id, name, mime_type, size, created_at, updated_at) VALUES ('file1', 'a.png', 'image/png', 10, ?, ?)").run(
        now,
        now,
      )
      db.prepare("INSERT INTO task_attachments (task_id, file_id) VALUES ('t1', 'file1')").run()
    }

    it("survives_TC-1_the_table_rebuild_with_every_task_row_and_tag_and_attachment_association_intact_and_accepts_backlog_with_a_null_schedule", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      seedThroughV9(db)
      seedTaskWithAssociations(db)

      runMigrations(db)

      const task = db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()
      expect(task).toBeDefined()
      expect(task.content).toBe(`Keep me\n\n![a.png](${APP_CONFIG.filesProtocol}/file1)`)
      expect(task.scheduled_date).toBe("2026-03-24")
      expect(db.prepare("SELECT name FROM files WHERE id = 'file1'").get().name).toBe("a.png")

      const taskTags = db.prepare("SELECT * FROM task_tags WHERE task_id = 't1'").all()
      expect(taskTags).toHaveLength(1)
      expect(taskTags[0].tag_id).toBe("tag1")

      const now = new Date().toISOString()
      expect(() =>
        db
          .prepare(
            `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
             VALUES ('t2', 'backlog', 'No day yet', 0, 2048, NULL, NULL, NULL, 0, 0, 'main', ?, ?)`,
          )
          .run(now, now),
      ).not.toThrow()

      const backlogTask = db.prepare("SELECT * FROM tasks WHERE id = 't2'").get()
      expect(backlogTask.status).toBe("backlog")
      expect(backlogTask.scheduled_date).toBeNull()
      expect(backlogTask.scheduled_time).toBeNull()
      expect(backlogTask.scheduled_timezone).toBeNull()

      db.close()
    })

    it("keeps_TC-2_all_four_task_indexes_after_the_rebuild", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tasks'")
        .all()
        .map((i) => i.name)

      expect(indexes).toContain("idx_tasks_branch_date")
      expect(indexes).toContain("idx_tasks_date")
      expect(indexes).toContain("idx_tasks_status")
      expect(indexes).toContain("idx_tasks_deleted")

      db.close()
    })
  })

  describe("v011 — milestones, project tags and project descriptions", () => {
    function seedThroughV10(db) {
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 10)) {
        if (typeof migration.up === "string") db.exec(migration.up)
        else migration.up(db)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-01-01T00:00:00.000Z",
        )
      }
    }

    it("gives_TC-8_a_fresh_database_the_milestones_table_and_the_three_new_columns", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      runMigrations(db)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tables).toContain("milestones")

      const milestoneColumns = db
        .prepare("PRAGMA table_info(milestones)")
        .all()
        .map((c) => c.name)
      expect(milestoneColumns).toEqual(expect.arrayContaining(["id", "branch_id", "name", "description", "target_date", "order_index"]))

      const taskColumns = db
        .prepare("PRAGMA table_info(tasks)")
        .all()
        .map((c) => c.name)
      expect(taskColumns).toContain("milestone_id")

      const tagColumns = db
        .prepare("PRAGMA table_info(tags)")
        .all()
        .map((c) => c.name)
      expect(tagColumns).toContain("branch_id")

      const branchColumns = db
        .prepare("PRAGMA table_info(branches)")
        .all()
        .map((c) => c.name)
      expect(branchColumns).toContain("description")

      db.close()
    })

    it("lands_TC-9_every_pre-existing_tag_on_main_keeping_its_id_name_colour_and_task_links", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      seedThroughV10(db)

      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
         VALUES ('t1', 'active', 'Keep me', 0, 1024, '2026-03-24', '10:00:00', 'UTC', 0, 0, 'main', ?, ?)`,
      ).run(now, now)
      db.prepare("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES ('tag1', 'urgent', '#ff0000', ?, ?)").run(now, now)
      db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES ('t1', 'tag1')").run()

      runMigrations(db)

      const tag = db.prepare("SELECT * FROM tags WHERE id = 'tag1'").get()
      expect(tag).toBeDefined()
      expect(tag.branch_id).toBe("main")
      expect(tag.name).toBe("urgent")
      expect(tag.color).toBe("#ff0000")

      const links = db.prepare("SELECT * FROM task_tags WHERE task_id = 't1'").all()
      expect(links).toHaveLength(1)
      expect(links[0].tag_id).toBe("tag1")

      db.close()
    })
  })

  describe("v012 — task relations", () => {
    function seedThroughV11(db) {
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 11)) {
        if (typeof migration.up === "string") db.exec(migration.up)
        else migration.up(db)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-01-01T00:00:00.000Z",
        )
      }
    }

    it("gives_TC-4_a_v011_database_a_task_relations_table_with_its_columns_and_indexes_leaves_tasks_untouched_and_drops_it_on_rollback", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      seedThroughV11(db)

      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
         VALUES ('t1', 'active', 'Keep me', 0, 1024, '2026-03-24', '10:00:00', 'UTC', 0, 0, 'main', ?, ?)`,
      ).run(now, now)

      runMigrations(db)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tables).toContain("task_relations")

      const columns = db
        .prepare("PRAGMA table_info(task_relations)")
        .all()
        .map((c) => c.name)
      expect(columns).toEqual(expect.arrayContaining(["id", "blocker_id", "blocked_id", "created_at", "updated_at", "deleted_at"]))

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_relations'")
        .all()
        .map((i) => i.name)
      const indexedColumns = indexes.flatMap((name) =>
        db
          .prepare(`PRAGMA index_info(${name})`)
          .all()
          .map((c) => c.name),
      )
      expect(indexedColumns).toEqual(expect.arrayContaining(["blocker_id", "blocked_id"]))

      const task = db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()
      expect(task).toBeDefined()
      expect(task.content).toBe("Keep me")

      expect(rollbackLastMigration(db)).toBe(21)
      expect(rollbackLastMigration(db)).toBe(20)
      expect(rollbackLastMigration(db)).toBe(19)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      const rolledBack = rollbackLastMigration(db)
      expect(rolledBack).toBe(12)

      const tablesAfterRollback = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tablesAfterRollback).not.toContain("task_relations")

      db.close()
    })
  })

  describe("v014 — comment origin split", () => {
    function seedThroughV13(db) {
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 13)) {
        if (typeof migration.up === "string") db.exec(migration.up)
        else migration.up(db)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-01-01T00:00:00.000Z",
        )
      }
    }

    function seedComment(db, id, origin) {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO task_comments (id, task_id, branch_id, content, origin, created_at, updated_at, deleted_at)
         VALUES (?, 't1', 'main', ?, ?, ?, ?, NULL)`,
      ).run(id, `written by ${origin ?? "a person"}`, origin, now, now)
    }

    it("reads_every_old_origin_as_a_kind_and_names_the_agent_that_wrote_one", () => {
      const db = new Database(":memory:")
      seedThroughV13(db)
      seedComment(db, "typed", null)
      seedComment(db, "via-mcp", "mcp")
      seedComment(db, "by-agent", "agent")

      runMigrations(db)

      const rows = db.prepare("SELECT id, kind, provider FROM task_comments ORDER BY id").all()
      expect(rows).toEqual([
        {id: "by-agent", kind: "agent", provider: "daily_agent"},
        {id: "typed", kind: "manual", provider: null},
        {id: "via-mcp", kind: "mcp", provider: null},
      ])

      const columns = db
        .prepare("PRAGMA table_info(task_comments)")
        .all()
        .map((c) => c.name)
      expect(columns).not.toContain("origin")

      db.close()
    })

    it("puts_the_origin_column_back_on_rollback_so_a_downgraded_build_still_reads_the_table", () => {
      const db = new Database(":memory:")
      seedThroughV13(db)
      seedComment(db, "by-agent", "agent")
      seedComment(db, "typed", null)
      runMigrations(db)

      expect(rollbackLastMigration(db)).toBe(21)
      expect(rollbackLastMigration(db)).toBe(20)
      expect(rollbackLastMigration(db)).toBe(19)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      expect(rollbackLastMigration(db)).toBe(14)

      const rows = db.prepare("SELECT id, origin FROM task_comments ORDER BY id").all()
      expect(rows).toEqual([
        {id: "by-agent", origin: "agent"},
        {id: "typed", origin: null},
      ])

      db.close()
    })
  })

  describe("v013 — task comments", () => {
    function seedThroughV12(db) {
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 12)) {
        if (typeof migration.up === "string") db.exec(migration.up)
        else migration.up(db)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-01-01T00:00:00.000Z",
        )
      }
    }

    it("gives_a_v012_database_a_task_comments_table_with_its_columns_and_indexes_leaves_tasks_untouched_and_drops_it_on_rollback", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      seedThroughV12(db)

      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
         VALUES ('t1', 'active', 'Keep me', 0, 1024, '2026-03-24', '10:00:00', 'UTC', 0, 0, 'main', ?, ?)`,
      ).run(now, now)

      runMigrations(db)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tables).toContain("task_comments")

      const columns = db
        .prepare("PRAGMA table_info(task_comments)")
        .all()
        .map((c) => c.name)
      expect(columns).toEqual(
        expect.arrayContaining(["id", "task_id", "branch_id", "content", "kind", "provider", "created_at", "updated_at", "deleted_at"]),
      )

      const nullableColumns = db
        .prepare("PRAGMA table_info(task_comments)")
        .all()
        .filter((c) => c.notnull === 0)
        .map((c) => c.name)
      expect(nullableColumns).toEqual(expect.arrayContaining(["provider", "deleted_at"]))

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_comments'")
        .all()
        .map((i) => i.name)
      const indexedColumns = indexes.flatMap((name) =>
        db
          .prepare(`PRAGMA index_info(${name})`)
          .all()
          .map((c) => c.name),
      )
      expect(indexedColumns).toEqual(expect.arrayContaining(["task_id", "branch_id"]))

      const task = db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()
      expect(task.content).toBe("Keep me")

      expect(rollbackLastMigration(db)).toBe(21)
      expect(rollbackLastMigration(db)).toBe(20)
      expect(rollbackLastMigration(db)).toBe(19)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      rollbackLastMigration(db)
      expect(rollbackLastMigration(db)).toBe(14)
      const rolledBack = rollbackLastMigration(db)
      expect(rolledBack).toBe(13)

      const tablesAfterRollback = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tablesAfterRollback).not.toContain("task_comments")

      db.close()
    })

    it("takes_a_comment_row_whose_task_does_not_exist_because_sync_can_deliver_one_before_its_task", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      seedThroughV12(db)
      runMigrations(db)

      const now = new Date().toISOString()
      const insert = () =>
        db
          .prepare(
            `INSERT INTO task_comments (id, task_id, branch_id, content, kind, provider, created_at, updated_at, deleted_at)
             VALUES ('c1', 'a-task-that-has-not-arrived', 'main', 'from another Mac', 'manual', NULL, ?, ?, NULL)`,
          )
          .run(now, now)

      expect(insert).not.toThrow()
      expect(db.prepare("SELECT kind FROM task_comments WHERE id = 'c1'").get().kind).toBe("manual")

      db.close()
    })
  })

  describe("v016 — attachments into content", () => {
    function seedThroughV15(db) {
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 15)) {
        if (typeof migration.up === "string") db.exec(migration.up)
        else migration.up(db)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-01-01T00:00:00.000Z",
        )
      }
    }

    function link(id) {
      return `${APP_CONFIG.filesProtocol}/${id}`
    }

    it("writes_TC-7_an_unmentioned_attachment_into_its_tasks_content_leaves_an_already-mentioned_one_untouched_and_drops_the_table", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      seedThroughV15(db)

      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
         VALUES ('t1', 'active', 'Unmentioned', 0, 1024, '2026-03-24', '10:00:00', 'UTC', 0, 0, 'main', ?, ?)`,
      ).run(now, now)
      db.prepare(
        `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
         VALUES ('t2', 'active', ?, 0, 1024, '2026-03-24', '10:00:00', 'UTC', 0, 0, 'main', ?, ?)`,
      ).run(`Already has ![shot](${link("file2")})`, now, now)

      db.prepare(`INSERT INTO files (id, name, mime_type, size, created_at, updated_at) VALUES ('file1', 'one.png', 'image/png', 10, ?, ?)`).run(
        now,
        now,
      )
      db.prepare(`INSERT INTO files (id, name, mime_type, size, created_at, updated_at) VALUES ('file2', 'shot.png', 'image/png', 10, ?, ?)`).run(
        now,
        now,
      )

      db.prepare(`INSERT INTO task_attachments (task_id, file_id) VALUES ('t1', 'file1')`).run()
      db.prepare(`INSERT INTO task_attachments (task_id, file_id) VALUES ('t2', 'file2')`).run()

      runMigrations(db)

      const t1 = db.prepare("SELECT content FROM tasks WHERE id = 't1'").get()
      expect(t1.content).toContain("Unmentioned")
      expect(t1.content).toContain(link("file1"))

      const t2 = db.prepare("SELECT content FROM tasks WHERE id = 't2'").get()
      expect(t2.content).toBe(`Already has ![shot](${link("file2")})`)
      const file2Mentions = t2.content.split(link("file2")).length - 1
      expect(file2Mentions).toBe(1)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
      expect(tables).not.toContain("task_attachments")

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all()
        .map((i) => i.name)
      expect(indexes).not.toContain("idx_task_attachments_file")

      db.close()
    })
  })

  describe("v017 — task priority", () => {
    function seedThroughV16(db) {
      db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
      for (const migration of migrations.filter((m) => m.version <= 16)) {
        if (typeof migration.up === "string") db.exec(migration.up)
        else migration.up(db)
        db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          "2026-01-01T00:00:00.000Z",
        )
      }
    }

    it("reads_every_task_that_existed_before_as_none_and_rolls_back_cleanly", () => {
      const db = new Database(":memory:")
      db.pragma("foreign_keys = ON")
      seedThroughV16(db)

      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
         VALUES ('t1', 'active', 'Old', 0, 1024, '2026-03-24', '10:00:00', 'UTC', 0, 0, 'main', ?, ?)`,
      ).run(now, now)

      runMigrations(db)

      expect(db.prepare("SELECT priority FROM tasks WHERE id = 't1'").get().priority).toBe("none")

      expect(rollbackLastMigration(db)).toBe(21)
      expect(rollbackLastMigration(db)).toBe(20)
      expect(rollbackLastMigration(db)).toBe(19)
      rollbackLastMigration(db)
      expect(rollbackLastMigration(db)).toBe(17)
      const columns = db
        .prepare("PRAGMA table_info(tasks)")
        .all()
        .map((c) => c.name)
      expect(columns).not.toContain("priority")
      expect(db.prepare("SELECT content FROM tasks WHERE id = 't1'").get().content).toBe("Old")

      db.close()
    })
  })
})

it("upgrades v17 statuses and preserves task fields and associations across reopening", () => {
  const directory = mkdtempSync("/tmp/daily-agent-status-migration-")
  let db = new Database(`${directory}/daily.sqlite`)
  db.pragma("foreign_keys = ON")
  db.exec("CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)")
  for (const migration of migrations.filter((m) => m.version <= 17)) {
    if (typeof migration.up === "string") db.exec(migration.up)
    else migration.up(db)
    db.prepare("INSERT INTO _migrations VALUES (?, ?, ?)").run(migration.version, migration.name, "now")
  }
  const now = "2026-10-29T00:00:00Z"
  db.prepare("INSERT INTO milestones (id, name, created_at, updated_at) VALUES ('m1', 'Keep milestone', ?, ?)").run(now, now)
  db.prepare(
    "INSERT INTO tasks (id, status, content, order_index, scheduled_date, scheduled_time, scheduled_timezone, milestone_id, priority, spent_time, created_at, updated_at) VALUES ('t1', 'active', 'Keep ![file](daily://file/f1)', 123, '2026-10-29', '10:00:00', 'UTC', 'm1', 'high', 42, ?, ?)",
  ).run(now, now)
  db.prepare("INSERT INTO tasks (id, status, created_at, updated_at) VALUES ('t2', 'discarded', ?, ?)").run(now, now)
  db.prepare("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES ('tag1', 'Keep tag', 'red', ?, ?)").run(now, now)
  db.exec("INSERT INTO task_tags VALUES ('t1', 'tag1')")
  db.prepare("INSERT INTO files (id, name, mime_type, size, created_at, updated_at) VALUES ('f1', 'file', 'text/plain', 1, ?, ?)").run(now, now)
  db.prepare(
    "INSERT INTO task_comments (id, task_id, branch_id, content, kind, provider, created_at, updated_at) VALUES ('c1', 't1', 'main', 'Keep comment', 'mcp', 'Codex', ?, ?)",
  ).run(now, now)
  db.prepare("INSERT INTO task_relations (id, blocker_id, blocked_id, created_at, updated_at) VALUES ('r1', 't1', 't2', ?, ?)").run(now, now)
  db.prepare(
    "INSERT INTO task_events (id, task_id, branch_id, type, event_date, created_at, kind) VALUES ('e1', 't1', 'main', 'discarded', '2026-10-29', ?, 'manual')",
  ).run(now)
  const before = db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()
  const related = ["task_tags", "files", "task_comments", "task_relations", "task_events"].map((table) => [
    table,
    db.prepare(`SELECT * FROM ${table}`).all(),
  ])
  runMigrations(db)
  expect(db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()).toEqual({...before, status: "in_progress"})
  expect(db.prepare("SELECT status FROM tasks WHERE id = 't2'").get().status).toBe("cancelled")
  for (const [table, rows] of related) {
    const loaded = db.prepare(`SELECT * FROM ${table}`).all()
    if (table === "task_events") expect(loaded).toMatchObject(rows)
    else expect(loaded).toEqual(rows)
  }
  for (const status of ["backlog", "ready_for_agent", "in_progress", "ready_to_merge", "done", "cancelled"]) {
    expect(() => db.prepare("UPDATE tasks SET status = ? WHERE id = 't2'").run(status)).not.toThrow()
  }
  expect(() => db.prepare("UPDATE tasks SET status = 'active' WHERE id = 't2'").run()).toThrow()
  db.close()
  db = new Database(`${directory}/daily.sqlite`)
  db.pragma("foreign_keys = ON")
  runMigrations(db)
  expect(db.prepare("SELECT status FROM tasks WHERE id = 't1'").get().status).toBe("in_progress")
  for (const [table, rows] of related) {
    const loaded = db.prepare(`SELECT * FROM ${table}`).all()
    if (table === "task_events") expect(loaded).toMatchObject(rows)
    else expect(loaded).toEqual(rows)
  }
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([])
  db.close()
  rmSync(directory, {recursive: true, force: true})
})

it("v019 adds the subtasks table to a v018 database, leaves tasks untouched and drops it on rollback", () => {
  const db = new Database(":memory:")
  db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
  for (const migration of migrations.filter((m) => m.version <= 18)) {
    if (typeof migration.up === "string") db.exec(migration.up)
    else migration.up(db)
    db.prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      migration.version,
      migration.name,
      "2026-01-01T00:00:00.000Z",
    )
  }
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
     VALUES ('t1', 'in_progress', 'Keep me', 0, 1024, '2026-03-24', '10:00:00', 'UTC', 0, 0, 'main', ?, ?)`,
  ).run(now, now)

  runMigrations(db)

  expect(
    db
      .prepare("PRAGMA table_info(subtasks)")
      .all()
      .map((c) => c.name),
  ).toEqual(["id", "task_id", "content", "done", "order_key", "created_at", "updated_at", "deleted_at"])
  expect(db.prepare("SELECT content FROM tasks WHERE id = 't1'").get().content).toBe("Keep me")

  expect(rollbackLastMigration(db)).toBe(21)
  expect(rollbackLastMigration(db)).toBe(20)
  expect(rollbackLastMigration(db)).toBe(19)
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'subtasks'").all()).toEqual([])
  db.close()
})

it("v020 preserves every v019 task and related row, stores To Do across reopening and maps only To Do on rollback", () => {
  const directory = mkdtempSync("/tmp/daily-todo-migration-")
  let db = new Database(`${directory}/daily.sqlite`)
  try {
    db.pragma("foreign_keys = ON")
    db.exec("CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)")
    for (const migration of migrations.filter((m) => m.version <= 19)) {
      if (typeof migration.up === "string") db.exec(migration.up)
      else migration.up(db)
      db.prepare("INSERT INTO _migrations VALUES (?, ?, ?)").run(migration.version, migration.name, "now")
    }
    const now = "2026-10-30T00:00:00Z"
    db.prepare("INSERT INTO milestones (id, name, created_at, updated_at) VALUES ('m1', 'Milestone', ?, ?)").run(now, now)
    for (const status of ["backlog", "ready_for_agent", "in_progress", "ready_to_merge", "done", "cancelled"]) {
      db.prepare(
        "INSERT INTO tasks (id, status, content, scheduled_date, scheduled_time, scheduled_timezone, milestone_id, priority, created_at, updated_at) VALUES (?, ?, 'Keep ![file](daily://file/f1)', ?, ?, ?, 'm1', 'high', ?, ?)",
      ).run(
        status,
        status,
        status === "backlog" ? null : "2026-10-30",
        status === "backlog" ? null : "10:00:00",
        status === "backlog" ? null : "UTC",
        now,
        now,
      )
    }
    db.prepare("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES ('tag1', 'Keep', 'red', ?, ?)").run(now, now)
    db.exec("INSERT INTO task_tags VALUES ('in_progress', 'tag1')")
    db.prepare("INSERT INTO files (id, name, mime_type, size, created_at, updated_at) VALUES ('f1', 'file', 'text/plain', 1, ?, ?)").run(now, now)
    db.prepare("INSERT INTO subtasks (id, task_id, content, order_key, created_at, updated_at) VALUES ('s1', 'in_progress', 'Keep', 'a', ?, ?)").run(
      now,
      now,
    )
    db.prepare(
      "INSERT INTO task_comments (id, task_id, branch_id, content, kind, created_at, updated_at) VALUES ('c1', 'in_progress', 'main', 'Keep', 'manual', ?, ?)",
    ).run(now, now)
    db.prepare("INSERT INTO task_relations (id, blocker_id, blocked_id, created_at, updated_at) VALUES ('r1', 'in_progress', 'backlog', ?, ?)").run(
      now,
      now,
    )
    db.prepare(
      "INSERT INTO task_events (id, task_id, branch_id, type, event_date, created_at) VALUES ('e1', 'in_progress', 'main', 'created', '2026-10-30', ?)",
    ).run(now)
    const before = db.prepare("SELECT * FROM tasks ORDER BY id").all()
    const related = ["task_tags", "files", "subtasks", "task_comments", "task_relations", "task_events"].map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table}`).all(),
    ])
    runMigrations(db)
    expect(getAppliedMigrations(db).at(-1).version).toBe(21)
    expect(db.prepare("SELECT * FROM tasks ORDER BY id").all()).toEqual(before)
    for (const [table, rows] of related) {
      const loaded = db.prepare(`SELECT * FROM ${table}`).all()
      if (table === "task_events") expect(loaded).toMatchObject(rows)
      else expect(loaded).toEqual(rows)
    }
    db.prepare("INSERT INTO tasks (id, scheduled_date, created_at, updated_at) VALUES ('new', '2026-10-31', ?, ?)").run(now, now)
    expect(db.prepare("SELECT status FROM tasks WHERE id = 'new'").get().status).toBe("todo")
    db.close()
    db = new Database(`${directory}/daily.sqlite`)
    db.pragma("foreign_keys = ON")
    runMigrations(db)
    expect(db.prepare("SELECT status FROM tasks WHERE id = 'new'").get().status).toBe("todo")
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    expect(rollbackLastMigration(db)).toBe(21)
    expect(rollbackLastMigration(db)).toBe(20)
    expect(db.prepare("SELECT status FROM tasks WHERE id = 'new'").get().status).toBe("in_progress")
    expect(db.prepare("SELECT * FROM tasks WHERE id != 'new' ORDER BY id").all()).toEqual(before)
    for (const [table, rows] of related) {
      const loaded = db.prepare(`SELECT * FROM ${table}`).all()
      if (table === "task_events") expect(loaded).toMatchObject(rows)
      else expect(loaded).toEqual(rows)
    }
    expect(() => db.prepare("UPDATE tasks SET status = 'todo' WHERE id = 'new'").run()).toThrow()
  } finally {
    db.close()
    rmSync(directory, {recursive: true, force: true})
  }
})

it("v021 preserves legacy activity without invented changes and removes only its new columns on rollback", () => {
  const db = new Database(":memory:")
  try {
    runMigrations(db)
    expect(rollbackLastMigration(db)).toBe(21)
    db.prepare("INSERT INTO task_events (id, task_id, branch_id, type, event_date, created_at, kind, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      "legacy",
      "t1",
      "main",
      "reactivated",
      "2026-10-31",
      "2026-10-31T00:00:00Z",
      "mcp",
      "Codex",
    )
    const before = db.prepare("SELECT * FROM task_events").all()
    runMigrations(db)
    expect(db.prepare("SELECT * FROM task_events").get()).toEqual({
      ...before[0],
      from_status: null,
      to_status: null,
      from_priority: null,
      to_priority: null,
      from_branch_id: null,
      to_branch_id: null,
      sequence: 0,
      move_id: null,
    })
    expect(rollbackLastMigration(db)).toBe(21)
    expect(db.prepare("SELECT * FROM task_events").all()).toEqual(before)
  } finally {
    db.close()
  }
})
