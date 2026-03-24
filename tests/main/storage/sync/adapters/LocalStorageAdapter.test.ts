// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {LocalStorageAdapter} from "@main/storage/sync/adapters/LocalStorageAdapter"
import {createTestDatabase} from "../../../../helpers/db"

vi.mock("@/utils/logger")
vi.mock("@/config")

describe("LocalStorageAdapter", () => {
  let db
  let adapter

  beforeEach(() => {
    db = createTestDatabase()
    adapter = new LocalStorageAdapter(db)
  })

  afterEach(() => {
    db.close()
  })

  // Helper to insert a task
  function insertTask(id, content = "Test task") {
    db.prepare(
      `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at)
       VALUES (?, 'active', ?, 0, 1.0, '2026-03-24', '', 'UTC', 0, 0, 'main', datetime('now'), datetime('now'))`,
    ).run(id, content)
  }

  describe("getDeviceId", () => {
    it("returns existing device_id from sync_meta", async () => {
      const deviceId = await adapter.getDeviceId()
      expect(deviceId).toBe("test-device-001")
    })

    it("generates UUID on first call when no device_id exists", async () => {
      db.prepare("DELETE FROM sync_meta WHERE key = 'device_id'").run()
      const deviceId = await adapter.getDeviceId()
      expect(deviceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

      // Second call returns same value
      const deviceId2 = await adapter.getDeviceId()
      expect(deviceId2).toBe(deviceId)
    })
  })

  describe("getUnsyncedChanges", () => {
    it("returns pending entries", async () => {
      insertTask("task-u1")
      const entries = await adapter.getUnsyncedChanges()
      expect(entries.length).toBeGreaterThan(0)
      expect(entries[0].synced).toBe(0)
      expect(entries[0].entity).toBe("task")
    })

    it("returns empty when no changes", async () => {
      // Clear any change_log entries from branches insert in migration
      db.prepare("DELETE FROM change_log").run()
      const entries = await adapter.getUnsyncedChanges()
      expect(entries).toEqual([])
    })
  })

  describe("getChangesSince", () => {
    it("filters by device and sequence", async () => {
      insertTask("task-cs1")
      const all = db.prepare("SELECT * FROM change_log ORDER BY sequence ASC").all()
      const maxSeq = all[all.length - 1].sequence

      // Get changes after a sequence that's before all entries
      const entries = await adapter.getChangesSince("test-device-001", 0)
      expect(entries.length).toBeGreaterThan(0)

      // Get changes after max sequence — should be empty
      const empty = await adapter.getChangesSince("test-device-001", maxSeq)
      expect(empty).toEqual([])
    })
  })

  describe("markChangesSynced", () => {
    it("flags entries as synced", async () => {
      insertTask("task-ms1")
      const entries = await adapter.getUnsyncedChanges()
      expect(entries.length).toBeGreaterThan(0)

      const maxSeq = Math.max(...entries.map((e) => e.sequence))
      await adapter.markChangesSynced(maxSeq)

      const unsynced = await adapter.getUnsyncedChanges()
      expect(unsynced).toEqual([])
    })
  })

  describe("applyRemoteDeltas", () => {
    it("applies update deltas without triggering change_log", async () => {
      insertTask("task-ard1", "Original")
      db.prepare("DELETE FROM change_log").run()

      const result = await adapter.applyRemoteDeltas(
        [
          {
            doc_id: "task-ard1",
            entity: "task",
            operation: "update",
            field_name: "content",
            old_value: "'Original'",
            new_value: "'Updated remotely'",
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 1,
            device_id: "remote-device",
          },
        ],
        "pull",
      )

      // Verify field updated
      const task = db.prepare("SELECT content FROM tasks WHERE id = 'task-ard1'").get()
      expect(task.content).toBe("Updated remotely")

      // Verify no new change_log entries (trigger suppression)
      const entries = db.prepare("SELECT * FROM change_log").all()
      expect(entries.length).toBe(0)

      expect(result.remote_deltas_processed).toBe(1)
      expect(result.docs_upserted).toBe(1)
    })

    it("applies insert deltas for new entity", async () => {
      db.prepare("DELETE FROM change_log").run()

      const result = await adapter.applyRemoteDeltas(
        [
          {
            doc_id: "task-new",
            entity: "task",
            operation: "insert",
            field_name: "status",
            old_value: null,
            new_value: "'active'",
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 1,
            device_id: "remote-device",
          },
          {
            doc_id: "task-new",
            entity: "task",
            operation: "insert",
            field_name: "content",
            old_value: null,
            new_value: "'Remote task'",
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 2,
            device_id: "remote-device",
          },
          {
            doc_id: "task-new",
            entity: "task",
            operation: "insert",
            field_name: "scheduled_date",
            old_value: null,
            new_value: "'2026-03-24'",
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 3,
            device_id: "remote-device",
          },
        ],
        "pull",
      )

      const task = db.prepare("SELECT * FROM tasks WHERE id = 'task-new'").get()
      expect(task).toBeDefined()
      expect(task.content).toBe("Remote task")
      expect(result.docs_upserted).toBe(1)
    })

    it("field-level LWW: remote wins when newer", async () => {
      insertTask("task-lww1", "Local content")
      // Manually add a local change_log entry at T1
      db.prepare(
        `INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      ).run("task-lww1", "task", "update", "content", "'Local content'", "2026-03-24T10:00:00.000Z", 100, "test-device-001", 0)
      // Clear other change_log entries for this task
      db.prepare("DELETE FROM change_log WHERE doc_id = 'task-lww1' AND sequence != 100").run()

      const result = await adapter.applyRemoteDeltas(
        [
          {
            doc_id: "task-lww1",
            entity: "task",
            operation: "update",
            field_name: "content",
            old_value: "'Original'",
            new_value: "'Remote content'",
            changed_at: "2026-03-24T12:00:00.000Z", // T2 > T1
            sequence: 1,
            device_id: "remote-device",
          },
        ],
        "pull",
      )

      const task = db.prepare("SELECT content FROM tasks WHERE id = 'task-lww1'").get()
      expect(task.content).toBe("Remote content")
      expect(result.conflicts.length).toBe(1)
      expect(result.conflicts[0].outcome).toBe("remote_wins")
    })

    it("field-level LWW: local wins when newer", async () => {
      insertTask("task-lww2", "Local newer")
      db.prepare(
        `INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      ).run("task-lww2", "task", "update", "content", "'Local newer'", "2026-03-24T14:00:00.000Z", 200, "test-device-001", 0)
      db.prepare("DELETE FROM change_log WHERE doc_id = 'task-lww2' AND sequence != 200").run()

      const result = await adapter.applyRemoteDeltas(
        [
          {
            doc_id: "task-lww2",
            entity: "task",
            operation: "update",
            field_name: "content",
            old_value: "'Original'",
            new_value: "'Remote older'",
            changed_at: "2026-03-24T10:00:00.000Z", // T2 < T1
            sequence: 1,
            device_id: "remote-device",
          },
        ],
        "pull",
      )

      const task = db.prepare("SELECT content FROM tasks WHERE id = 'task-lww2'").get()
      expect(task.content).toBe("Local newer") // Local preserved
      expect(result.conflicts[0].outcome).toBe("local_wins")
    })

    it("returns correct DeltaMergeResult", async () => {
      insertTask("task-dmr1")
      db.prepare("DELETE FROM change_log").run()

      const result = await adapter.applyRemoteDeltas(
        [
          {
            doc_id: "task-dmr1",
            entity: "task",
            operation: "update",
            field_name: "content",
            old_value: null,
            new_value: "'New'",
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 5,
            device_id: "remote-dev",
          },
        ],
        "pull",
      )

      expect(result.remote_deltas_processed).toBe(1)
      expect(result.docs_upserted).toBe(1)
      expect(result.updated_cursors).toEqual({"remote-dev": 5})
    })
  })

  describe("writeSyncAudit + getSyncAuditLog", () => {
    it("writes and reads audit entries", async () => {
      await adapter.writeSyncAudit({
        started_at: "2026-03-24T12:00:00.000Z",
        completed_at: "2026-03-24T12:00:01.000Z",
        duration_ms: 1000,
        strategy: "pull",
        outcome: "success",
        deltas_pushed: 0,
        deltas_pulled: 5,
        conflicts_resolved: 0,
        docs_upserted: 3,
        docs_deleted: 0,
        error_message: null,
        device_id: "test-device-001",
      })

      const log = await adapter.getSyncAuditLog()
      expect(log.length).toBe(1)
      expect(log[0].strategy).toBe("pull")
      expect(log[0].outcome).toBe("success")
      expect(log[0].deltas_pulled).toBe(5)
    })
  })

  describe("pruneSyncAudit", () => {
    it("prunes old entries by age and count", async () => {
      // Insert old entry
      db.prepare(
        `INSERT INTO sync_audit (started_at, completed_at, duration_ms, strategy, outcome, deltas_pushed, deltas_pulled, conflicts_resolved, docs_upserted, docs_deleted, device_id)
         VALUES ('2020-01-01T00:00:00.000Z', '2020-01-01T00:00:01.000Z', 1000, 'pull', 'success', 0, 0, 0, 0, 0, 'dev1')`,
      ).run()

      // Insert recent entry
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO sync_audit (started_at, completed_at, duration_ms, strategy, outcome, deltas_pushed, deltas_pulled, conflicts_resolved, docs_upserted, docs_deleted, device_id)
         VALUES (?, ?, 1000, 'pull', 'success', 0, 0, 0, 0, 0, 'dev1')`,
      ).run(now, now)

      const deleted = await adapter.pruneSyncAudit(30 * 24 * 60 * 60 * 1000, 1000)
      expect(deleted).toBe(1) // The old entry

      const remaining = await adapter.getSyncAuditLog()
      expect(remaining.length).toBe(1)
    })
  })

  describe("applyRemoteDeltas edge cases", () => {
    it("INSERT for entity that already exists uses INSERT OR REPLACE without creating change_log entries", async () => {
      // Insert a task directly
      insertTask("task-exists", "Original content")
      db.prepare("DELETE FROM change_log").run()

      // Apply INSERT delta for the same task ID
      const result = await adapter.applyRemoteDeltas(
        [
          {
            doc_id: "task-exists",
            entity: "task",
            operation: "insert",
            field_name: "status",
            old_value: null,
            new_value: "'active'",
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 1,
            device_id: "remote-device",
          },
          {
            doc_id: "task-exists",
            entity: "task",
            operation: "insert",
            field_name: "content",
            old_value: null,
            new_value: "'Replaced content'",
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 2,
            device_id: "remote-device",
          },
        ],
        "pull",
      )

      // Task should be updated (INSERT OR REPLACE)
      const task = db.prepare("SELECT * FROM tasks WHERE id = 'task-exists'").get()
      expect(task).toBeDefined()
      expect(task.content).toBe("Replaced content")

      // No change_log entries should have been created (trigger suppression)
      const entries = db.prepare("SELECT * FROM change_log").all()
      expect(entries.length).toBe(0)

      expect(result.docs_upserted).toBe(1)
    })

    it("settings deltas with null field_name do not crash", async () => {
      // Insert a settings row
      db.prepare(
        `INSERT OR REPLACE INTO settings (id, version, data, created_at, updated_at) VALUES ('default', 1, '{"version":1}', datetime('now'), datetime('now'))`,
      ).run()
      db.prepare("DELETE FROM change_log").run()

      // Apply settings delta with field_name=null (full blob replacement)
      const result = await adapter.applyRemoteDeltas(
        [
          {
            doc_id: "default",
            entity: "settings",
            operation: "update",
            field_name: null,
            old_value: '{"version":1}',
            new_value: '{"version":1,"theme":"dark"}',
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 1,
            device_id: "remote-device",
          },
        ],
        "pull",
      )

      // Should not crash and should process without error
      expect(result.remote_deltas_processed).toBe(1)

      // NOTE: Known limitation — settings deltas with field_name=null are currently
      // skipped by the LWW loop (`!delta.field_name` guard). Settings are NOT applied
      // on the receiving end. This test documents the current behavior.
      const row = db.prepare("SELECT data FROM settings WHERE id = 'default'").get()
      expect(row).toBeDefined()
      const data = JSON.parse(row.data)
      expect(data.theme).toBeUndefined() // Settings delta was not applied (known issue)
    })

    it("delete delta soft-deletes via deleted_at", async () => {
      insertTask("task-del", "To delete")
      db.prepare("DELETE FROM change_log").run()

      const result = await adapter.applyRemoteDeltas(
        [
          {
            doc_id: "task-del",
            entity: "task",
            operation: "delete",
            field_name: null,
            old_value: null,
            new_value: null,
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 1,
            device_id: "remote-device",
          },
        ],
        "pull",
      )

      const task = db.prepare("SELECT * FROM tasks WHERE id = 'task-del'").get()
      expect(task.deleted_at).not.toBeNull()
      expect(result.docs_deleted).toBe(1)

      // No change_log entries (trigger suppression)
      const entries = db.prepare("SELECT * FROM change_log").all()
      expect(entries.length).toBe(0)
    })
  })

  describe("existing methods still work", () => {
    it("loadAllDocs returns data", async () => {
      insertTask("task-existing")
      const docs = await adapter.loadAllDocs()
      expect(docs.tasks.length).toBeGreaterThan(0)
      expect(docs.branches.length).toBeGreaterThan(0) // 'main' from migration
    })
  })
})
