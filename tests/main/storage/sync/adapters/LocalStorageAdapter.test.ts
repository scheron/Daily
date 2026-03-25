// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {LocalStorageAdapter} from "@main/storage/sync/adapters/LocalStorageAdapter"
import {createTestDatabase} from "../../../../helpers/db"

const now = "2026-03-25T12:00:00.000Z"

function insertTask(db, id, content, opts = {}) {
  db.prepare(
    `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, 0, 0, ?, '', 'UTC', 0, 0, ?, ?, ?, ?)`,
  ).run(id, opts.status ?? "active", content, opts.date ?? "2026-03-25", opts.branchId ?? "main", now, now, opts.deletedAt ?? null)
}

function insertTag(db, id, name, color = "#ff0000") {
  db.prepare("INSERT INTO tags (id, name, color, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, name, color, now, now, null)
}

function insertBranch(db, id, name) {
  db.prepare("INSERT OR REPLACE INTO branches (id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)").run(id, name, now, now, null)
}

function insertFile(db, id, name) {
  db.prepare("INSERT INTO files (id, name, mime_type, size, created_at, updated_at, deleted_at) VALUES (?, ?, 'text/plain', 100, ?, ?, ?)").run(
    id,
    name,
    now,
    now,
    null,
  )
}

function linkTaskTag(db, taskId, tagId) {
  db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(taskId, tagId)
}

function linkTaskAttachment(db, taskId, fileId) {
  db.prepare("INSERT INTO task_attachments (task_id, file_id) VALUES (?, ?)").run(taskId, fileId)
}

function insertSettings(db, data = {}) {
  const d = {version: "1", themes: {current: "light"}, ...data}
  db.prepare("INSERT OR REPLACE INTO settings (id, version, data, created_at, updated_at) VALUES ('default', ?, ?, ?, ?)").run(
    d.version,
    JSON.stringify(d),
    now,
    now,
  )
}

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

  describe("loadAllDocs", () => {
    it("returns empty collections from empty DB", async () => {
      const docs = await adapter.loadAllDocs()
      // DB has default "main" branch from migration
      expect(docs.tasks).toHaveLength(0)
      expect(docs.tags).toHaveLength(0)
      expect(docs.files).toHaveLength(0)
      expect(docs.settings).toBeNull()
    })

    it("loads tasks with tags and attachments", async () => {
      insertTask(db, "t1", "Hello")
      insertTag(db, "tag1", "work")
      insertFile(db, "f1", "file.txt")
      linkTaskTag(db, "t1", "tag1")
      linkTaskAttachment(db, "t1", "f1")

      const docs = await adapter.loadAllDocs()
      expect(docs.tasks).toHaveLength(1)
      expect(docs.tasks[0].tags).toEqual(["tag1"])
      expect(docs.tasks[0].attachments).toEqual(["f1"])
    })

    it("loads tags, branches, files", async () => {
      insertTag(db, "tag1", "work")
      insertBranch(db, "branch1", "feature")
      insertFile(db, "f1", "file.txt")

      const docs = await adapter.loadAllDocs()
      expect(docs.tags).toHaveLength(1)
      expect(docs.tags[0].name).toBe("work")
      // branches includes "main" from migration + our branch
      expect(docs.branches.length).toBeGreaterThanOrEqual(2)
      expect(docs.files).toHaveLength(1)
    })

    it("loads settings (parses JSON data field)", async () => {
      insertSettings(db, {version: "1", themes: {current: "dark"}})

      const docs = await adapter.loadAllDocs()
      expect(docs.settings).not.toBeNull()
      expect(docs.settings.id).toBe("default")
      expect(docs.settings.themes.current).toBe("dark")
    })

    it("includes soft-deleted records (deleted_at IS NOT NULL)", async () => {
      insertTask(db, "t1", "Deleted task", {deletedAt: now})

      const docs = await adapter.loadAllDocs()
      expect(docs.tasks).toHaveLength(1)
      expect(docs.tasks[0].deleted_at).toBe(now)
    })
  })

  describe("upsertDocs", () => {
    it("inserts new tasks with all fields", async () => {
      const docs = {
        tasks: [
          {
            id: "t1",
            status: "active",
            content: "Test",
            minimized: false,
            order_index: 1.5,
            scheduled_date: "2026-03-25",
            scheduled_time: "10:00",
            scheduled_timezone: "UTC",
            estimated_time: 3600,
            spent_time: 0,
            branch_id: "main",
            tags: [],
            attachments: [],
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        ],
        tags: [],
        branches: [],
        files: [],
        settings: null,
      }

      await adapter.upsertDocs(docs)

      const row = db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()
      expect(row).toBeDefined()
      expect(row.content).toBe("Test")
      expect(row.order_index).toBe(1.5)
      expect(row.estimated_time).toBe(3600)
    })

    it("updates existing tasks (INSERT OR REPLACE)", async () => {
      insertTask(db, "t1", "Original")

      await adapter.upsertDocs({
        tasks: [
          {
            id: "t1",
            status: "done",
            content: "Updated",
            minimized: true,
            order_index: 0,
            scheduled_date: "2026-03-25",
            scheduled_time: "",
            scheduled_timezone: "UTC",
            estimated_time: 0,
            spent_time: 0,
            branch_id: "main",
            tags: [],
            attachments: [],
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        ],
        tags: [],
        branches: [],
        files: [],
        settings: null,
      })

      const row = db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()
      expect(row.content).toBe("Updated")
      expect(row.status).toBe("done")
    })

    it("rebuilds task_tags junction on upsert", async () => {
      insertTag(db, "tag1", "a")
      insertTag(db, "tag2", "b")
      insertTask(db, "t1", "task")
      linkTaskTag(db, "t1", "tag1")

      await adapter.upsertDocs({
        tasks: [
          {
            id: "t1",
            status: "active",
            content: "task",
            minimized: false,
            order_index: 0,
            scheduled_date: "2026-03-25",
            scheduled_time: "",
            scheduled_timezone: "UTC",
            estimated_time: 0,
            spent_time: 0,
            branch_id: "main",
            tags: ["tag2"],
            attachments: [],
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        ],
        tags: [],
        branches: [],
        files: [],
        settings: null,
      })

      const tags = db
        .prepare("SELECT tag_id FROM task_tags WHERE task_id = 't1'")
        .all()
        .map((r) => r.tag_id)
      expect(tags).toEqual(["tag2"])
    })

    it("rebuilds task_attachments junction on upsert", async () => {
      insertFile(db, "f1", "a.txt")
      insertFile(db, "f2", "b.txt")
      insertTask(db, "t1", "task")
      linkTaskAttachment(db, "t1", "f1")

      await adapter.upsertDocs({
        tasks: [
          {
            id: "t1",
            status: "active",
            content: "task",
            minimized: false,
            order_index: 0,
            scheduled_date: "2026-03-25",
            scheduled_time: "",
            scheduled_timezone: "UTC",
            estimated_time: 0,
            spent_time: 0,
            branch_id: "main",
            tags: [],
            attachments: ["f2"],
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        ],
        tags: [],
        branches: [],
        files: [],
        settings: null,
      })

      const files = db
        .prepare("SELECT file_id FROM task_attachments WHERE task_id = 't1'")
        .all()
        .map((r) => r.file_id)
      expect(files).toEqual(["f2"])
    })

    it("inserts tags, branches, files", async () => {
      await adapter.upsertDocs({
        tasks: [],
        tags: [{id: "tag1", name: "work", color: "#00f", created_at: now, updated_at: now, deleted_at: null}],
        branches: [{id: "b1", name: "feat", created_at: now, updated_at: now, deleted_at: null}],
        files: [{id: "f1", name: "pic.png", mime_type: "image/png", size: 500, created_at: now, updated_at: now, deleted_at: null}],
        settings: null,
      })

      expect(db.prepare("SELECT * FROM tags WHERE id = 'tag1'").get()).toBeDefined()
      expect(db.prepare("SELECT * FROM branches WHERE id = 'b1'").get()).toBeDefined()
      expect(db.prepare("SELECT * FROM files WHERE id = 'f1'").get()).toBeDefined()
    })

    it("upserts settings (INSERT OR REPLACE with JSON data)", async () => {
      await adapter.upsertDocs({
        tasks: [],
        tags: [],
        branches: [],
        files: [],
        settings: {id: "default", version: "1", themes: {current: "dark"}, created_at: now, updated_at: now},
      })

      const row = db.prepare("SELECT * FROM settings WHERE id = 'default'").get()
      expect(row).toBeDefined()
      const data = JSON.parse(row.data)
      expect(data.themes.current).toBe("dark")
    })

    it("runs in a single transaction (all-or-nothing)", async () => {
      // Insert a valid tag and an invalid task (missing branch FK)
      // This should fail atomically
      const tasksBefore = db.prepare("SELECT COUNT(*) as c FROM tags").get().c

      try {
        await adapter.upsertDocs({
          tasks: [
            {
              id: "t1",
              status: "active",
              content: "test",
              minimized: false,
              order_index: 0,
              scheduled_date: "2026-03-25",
              scheduled_time: "",
              scheduled_timezone: "UTC",
              estimated_time: 0,
              spent_time: 0,
              branch_id: "nonexistent-branch", // FK violation
              tags: [],
              attachments: [],
              created_at: now,
              updated_at: now,
              deleted_at: null,
            },
          ],
          tags: [{id: "tag-new", name: "new", color: "#000", created_at: now, updated_at: now, deleted_at: null}],
          branches: [],
          files: [],
          settings: null,
        })
      } catch {
        // expected
      }

      // Tag should NOT be inserted due to transaction rollback
      const tagsAfter = db.prepare("SELECT COUNT(*) as c FROM tags").get().c
      expect(tagsAfter).toBe(tasksBefore)
    })
  })

  describe("deleteDocs", () => {
    it("hard-deletes tasks and their junction records", async () => {
      insertTask(db, "t1", "task")
      insertTag(db, "tag1", "work")
      linkTaskTag(db, "t1", "tag1")
      insertFile(db, "f1", "file.txt")
      linkTaskAttachment(db, "t1", "f1")

      await adapter.deleteDocs({tasks: ["t1"]})

      expect(db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()).toBeUndefined()
      expect(db.prepare("SELECT * FROM task_tags WHERE task_id = 't1'").all()).toHaveLength(0)
      expect(db.prepare("SELECT * FROM task_attachments WHERE task_id = 't1'").all()).toHaveLength(0)
    })

    it("hard-deletes tags and cleans task_tags", async () => {
      insertTask(db, "t1", "task")
      insertTag(db, "tag1", "work")
      linkTaskTag(db, "t1", "tag1")

      await adapter.deleteDocs({tags: ["tag1"]})

      expect(db.prepare("SELECT * FROM tags WHERE id = 'tag1'").get()).toBeUndefined()
      expect(db.prepare("SELECT * FROM task_tags WHERE tag_id = 'tag1'").all()).toHaveLength(0)
    })

    it("hard-deletes branches and reassigns tasks to 'main'", async () => {
      insertBranch(db, "b1", "feature")
      insertTask(db, "t1", "task", {branchId: "b1"})

      await adapter.deleteDocs({branches: ["b1"]})

      expect(db.prepare("SELECT * FROM branches WHERE id = 'b1'").get()).toBeUndefined()
      const task = db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()
      expect(task.branch_id).toBe("main")
    })

    it("hard-deletes files and cleans task_attachments", async () => {
      insertTask(db, "t1", "task")
      insertFile(db, "f1", "file.txt")
      linkTaskAttachment(db, "t1", "f1")

      await adapter.deleteDocs({files: ["f1"]})

      expect(db.prepare("SELECT * FROM files WHERE id = 'f1'").get()).toBeUndefined()
      expect(db.prepare("SELECT * FROM task_attachments WHERE file_id = 'f1'").all()).toHaveLength(0)
    })

    it("does nothing for empty id arrays", async () => {
      insertTask(db, "t1", "task")

      await adapter.deleteDocs({tasks: [], tags: [], branches: [], files: []})

      expect(db.prepare("SELECT * FROM tasks WHERE id = 't1'").get()).toBeDefined()
    })
  })
})
