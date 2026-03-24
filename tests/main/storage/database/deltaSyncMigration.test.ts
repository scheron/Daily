// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {createTestDatabase} from "../../../helpers/db"

vi.mock("@/utils/logger")
vi.mock("@/config")

describe("deltaSyncMigration", () => {
  let db

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it("creates the change_log, sync_audit, and sync_meta tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('change_log', 'sync_audit', 'sync_meta')")
      .all()
      .map((r) => r.name)

    expect(tables).toContain("change_log")
    expect(tables).toContain("sync_audit")
    expect(tables).toContain("sync_meta")
  })

  it("creates all 5 new indexes", () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name IN (" +
          "'idx_change_log_unsynced', 'idx_change_log_device_sequence', 'idx_change_log_synced_sequence', " +
          "'idx_sync_audit_started_at', 'idx_sync_audit_device_started')",
      )
      .all()
      .map((r) => r.name)

    expect(indexes).toContain("idx_change_log_unsynced")
    expect(indexes).toContain("idx_change_log_device_sequence")
    expect(indexes).toContain("idx_change_log_synced_sequence")
    expect(indexes).toContain("idx_sync_audit_started_at")
    expect(indexes).toContain("idx_sync_audit_device_started")
  })

  it("creates all 17 triggers", () => {
    const expectedTriggers = [
      "trg_tasks_insert",
      "trg_tasks_update",
      "trg_tasks_delete",
      "trg_tags_insert",
      "trg_tags_update",
      "trg_tags_delete",
      "trg_branches_insert",
      "trg_branches_update",
      "trg_branches_delete",
      "trg_files_insert",
      "trg_files_update",
      "trg_files_delete",
      "trg_task_tags_insert",
      "trg_task_tags_delete",
      "trg_task_attachments_insert",
      "trg_task_attachments_delete",
      "trg_settings_update",
    ]

    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
      .all()
      .map((r) => r.name)

    for (const name of expectedTriggers) {
      expect(triggers).toContain(name)
    }
    expect(triggers.length).toBe(17)
  })

  it("captures task INSERT in change_log", () => {
    db.prepare(
      `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
       VALUES ('task-001', 'active', 'Hello world', 0, 1.0, '2026-03-24', '', 'UTC', 0, 0, 'main', datetime('now'), datetime('now'), NULL)`,
    ).run()

    const entries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'task-001'").all()

    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0].entity).toBe("task")
    expect(entries[0].operation).toBe("insert")

    const fieldNames = entries.map((e) => e.field_name)
    expect(fieldNames).toContain("content")
    expect(fieldNames).toContain("status")
  })

  it("captures task UPDATE with correct old/new values in change_log", () => {
    db.prepare(
      `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
       VALUES ('task-002', 'active', 'Original content', 0, 1.0, '2026-03-24', '', 'UTC', 0, 0, 'main', datetime('now'), datetime('now'), NULL)`,
    ).run()

    db.prepare("DELETE FROM change_log WHERE doc_id = 'task-002'").run()

    db.prepare("UPDATE tasks SET content = 'Updated content', updated_at = datetime('now') WHERE id = 'task-002'").run()

    const entries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'task-002' AND operation = 'update'").all()

    expect(entries.length).toBeGreaterThan(0)
    const contentEntry = entries.find((e) => e.field_name === "content")
    expect(contentEntry).toBeDefined()
    expect(contentEntry.old_value).toBe("'Original content'")
    expect(contentEntry.new_value).toBe("'Updated content'")
  })

  it("captures task DELETE in change_log", () => {
    db.pragma("foreign_keys = OFF")

    db.prepare(
      `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
       VALUES ('task-003', 'active', 'To be deleted', 0, 1.0, '2026-03-24', '', 'UTC', 0, 0, 'main', datetime('now'), datetime('now'), NULL)`,
    ).run()

    db.prepare("DELETE FROM change_log WHERE doc_id = 'task-003'").run()

    db.prepare("DELETE FROM tasks WHERE id = 'task-003'").run()

    db.pragma("foreign_keys = ON")

    const entries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'task-003' AND operation = 'delete'").all()

    expect(entries.length).toBe(1)
    expect(entries[0].entity).toBe("task")
    expect(entries[0].operation).toBe("delete")
  })

  it("suppresses trigger when applying_remote = '1', fires when reset to '0'", () => {
    db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('applying_remote', '1')").run()

    db.prepare(
      `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
       VALUES ('task-004', 'active', 'Suppressed insert', 0, 1.0, '2026-03-24', '', 'UTC', 0, 0, 'main', datetime('now'), datetime('now'), NULL)`,
    ).run()

    const suppressedEntries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'task-004'").all()
    expect(suppressedEntries.length).toBe(0)

    db.prepare("UPDATE sync_meta SET value = '0' WHERE key = 'applying_remote'").run()

    db.prepare(
      `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
       VALUES ('task-005', 'active', 'Active insert', 0, 1.0, '2026-03-24', '', 'UTC', 0, 0, 'main', datetime('now'), datetime('now'), NULL)`,
    ).run()

    const activeEntries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'task-005'").all()
    expect(activeEntries.length).toBeGreaterThan(0)
  })

  it("captures tag INSERT, UPDATE, and DELETE in change_log", () => {
    db.prepare(
      `INSERT INTO tags (id, name, color, created_at, updated_at, deleted_at)
       VALUES ('tag-001', 'urgent', '#ff0000', datetime('now'), datetime('now'), NULL)`,
    ).run()

    const insertEntries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'tag-001' AND operation = 'insert'").all()
    expect(insertEntries.length).toBeGreaterThan(0)
    expect(insertEntries[0].entity).toBe("tag")

    db.prepare("DELETE FROM change_log WHERE doc_id = 'tag-001'").run()

    db.prepare("UPDATE tags SET color = '#00ff00', updated_at = datetime('now') WHERE id = 'tag-001'").run()

    const updateEntries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'tag-001' AND operation = 'update'").all()
    expect(updateEntries.length).toBeGreaterThan(0)
    const colorEntry = updateEntries.find((e) => e.field_name === "color")
    expect(colorEntry).toBeDefined()

    db.prepare("DELETE FROM change_log WHERE doc_id = 'tag-001'").run()

    db.prepare("DELETE FROM tags WHERE id = 'tag-001'").run()

    const deleteEntries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'tag-001' AND operation = 'delete'").all()
    expect(deleteEntries.length).toBe(1)
  })

  it("captures task_tags INSERT in change_log with entity='task' and field_name='tags'", () => {
    db.prepare(
      `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
       VALUES ('task-006', 'active', 'Task with tag', 0, 1.0, '2026-03-24', '', 'UTC', 0, 0, 'main', datetime('now'), datetime('now'), NULL)`,
    ).run()

    db.prepare(
      `INSERT INTO tags (id, name, color, created_at, updated_at, deleted_at)
       VALUES ('tag-002', 'work', '#0000ff', datetime('now'), datetime('now'), NULL)`,
    ).run()

    db.prepare("DELETE FROM change_log").run()

    db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES ('task-006', 'tag-002')").run()

    const entries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'task-006' AND field_name = 'tags'").all()
    expect(entries.length).toBe(1)
    expect(entries[0].entity).toBe("task")
    expect(entries[0].operation).toBe("update")
    expect(entries[0].field_name).toBe("tags")
  })

  it("captures settings UPDATE in change_log with entity='settings'", () => {
    db.prepare(
      `INSERT INTO settings (id, version, data, created_at, updated_at)
       VALUES ('default', '1', '{"theme":"light"}', datetime('now'), datetime('now'))`,
    ).run()

    db.prepare("DELETE FROM change_log WHERE doc_id = 'default'").run()

    db.prepare("UPDATE settings SET data = '{\"theme\":\"dark\"}', updated_at = datetime('now') WHERE id = 'default'").run()

    const entries = db.prepare("SELECT * FROM change_log WHERE doc_id = 'default' AND entity = 'settings'").all()
    expect(entries.length).toBe(1)
    expect(entries[0].entity).toBe("settings")
    expect(entries[0].operation).toBe("update")
  })
})
