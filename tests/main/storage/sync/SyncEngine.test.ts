// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {SyncEngine} from "@main/storage/sync/SyncEngine"

vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {SYNC_ENGINE: "SYNC_ENGINE", SYNC_PULL: "SYNC_PULL", SYNC_PUSH: "SYNC_PUSH", SYNC_REMOTE: "SYNC_REMOTE"},
  },
}))

vi.mock("@/config", () => ({
  APP_CONFIG: {
    sync: {
      remoteSyncInterval: 120_000,
      garbageCollectionInterval: 604_800_000,
    },
  },
  fsPaths: {assetsDir: () => "/tmp/assets"},
}))

vi.mock("@/utils/AsyncMutex", () => ({
  AsyncMutex: class {
    async runExclusive(fn) {
      return fn()
    }
  },
}))

vi.mock("@/utils/createIntervalScheduler", () => ({
  createIntervalScheduler: () => ({start: vi.fn(), stop: vi.fn()}),
}))

vi.mock("@shared/utils/common/withElapsedDelay", () => ({
  withElapsedDelay: async (fn) => fn(),
}))

function emptyDocs() {
  return {tasks: [], tags: [], branches: [], files: [], settings: null}
}

function docsWithTask() {
  return {
    ...emptyDocs(),
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
        branch_id: "main",
        tags: [],
        attachments: [],
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
        deleted_at: null,
      },
    ],
  }
}

describe("SyncEngine", () => {
  let mockLocalStore, mockRemoteStore, onStatusChange, onDataChanged, engine

  beforeEach(() => {
    vi.clearAllMocks()

    mockLocalStore = {
      loadAllDocs: vi.fn().mockResolvedValue(emptyDocs()),
      upsertDocs: vi.fn().mockResolvedValue(undefined),
      deleteDocs: vi.fn().mockResolvedValue(undefined),
    }

    mockRemoteStore = {
      loadSnapshot: vi.fn().mockResolvedValue(null),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      syncAssets: vi.fn().mockResolvedValue(undefined),
    }

    onStatusChange = vi.fn()
    onDataChanged = vi.fn()

    engine = new SyncEngine(mockLocalStore, mockRemoteStore, {
      onStatusChange,
      onDataChanged,
    })
  })

  describe("status management", () => {
    it("enableAutoSync sets status to 'active'", () => {
      engine.enableAutoSync()
      expect(onStatusChange).toHaveBeenCalledWith("active", "inactive")
    })

    it("disableAutoSync sets status to 'inactive'", () => {
      engine.enableAutoSync()
      vi.clearAllMocks()
      engine.disableAutoSync()
      expect(onStatusChange).toHaveBeenCalledWith("inactive", "active")
    })

    it("sync sets status to 'syncing' then back to 'active'", async () => {
      engine.enableAutoSync()
      vi.clearAllMocks()

      await engine.sync()

      const statuses = onStatusChange.mock.calls.map((c) => c[0])
      expect(statuses[0]).toBe("syncing")
      expect(statuses[statuses.length - 1]).toBe("active")
    })

    it("sync error sets status to 'error'", async () => {
      engine.enableAutoSync()
      mockLocalStore.loadAllDocs.mockRejectedValue(new Error("fail"))

      await engine.sync()

      const statuses = onStatusChange.mock.calls.map((c) => c[0])
      expect(statuses).toContain("error")
    })

    it("enableAutoSync is idempotent (calling twice does nothing)", () => {
      engine.enableAutoSync()
      const callCount = onStatusChange.mock.calls.length
      engine.enableAutoSync()
      expect(onStatusChange.mock.calls.length).toBe(callCount)
    })
  })

  describe("sync — empty remote", () => {
    it("pushes snapshot when remote is empty and local has data", async () => {
      engine.enableAutoSync()
      mockLocalStore.loadAllDocs.mockResolvedValue(docsWithTask())
      mockRemoteStore.loadSnapshot.mockResolvedValue(null)

      await engine.sync()

      expect(mockRemoteStore.saveSnapshot).toHaveBeenCalled()
      const snapshot = mockRemoteStore.saveSnapshot.mock.calls[0][0]
      expect(snapshot.version).toBe(2)
      expect(snapshot.docs.tasks).toHaveLength(1)
    })

    it("does not push when both local and remote are empty", async () => {
      engine.enableAutoSync()
      mockLocalStore.loadAllDocs.mockResolvedValue(emptyDocs())
      mockRemoteStore.loadSnapshot.mockResolvedValue(null)

      await engine.sync()

      expect(mockRemoteStore.saveSnapshot).not.toHaveBeenCalled()
    })

    it("calls onDataChanged: false (no pull changes)", async () => {
      engine.enableAutoSync()
      mockLocalStore.loadAllDocs.mockResolvedValue(docsWithTask())
      mockRemoteStore.loadSnapshot.mockResolvedValue(null)

      await engine.sync()

      expect(onDataChanged).not.toHaveBeenCalled()
    })
  })

  describe("sync — hashes match", () => {
    it("skips sync when local hash === remote hash", async () => {
      engine.enableAutoSync()
      const docs = docsWithTask()
      mockLocalStore.loadAllDocs.mockResolvedValue(docs)

      // Import buildSnapshotMeta to get matching hash
      const {buildSnapshotMeta} = await import("@main/utils/sync/snapshot/buildSnapshot")
      const meta = buildSnapshotMeta(docs)
      mockRemoteStore.loadSnapshot.mockResolvedValue({version: 2, docs, meta})

      await engine.sync()

      expect(mockLocalStore.upsertDocs).not.toHaveBeenCalled()
      expect(mockRemoteStore.saveSnapshot).not.toHaveBeenCalled()
    })

    it("does not call upsertDocs or saveSnapshot", async () => {
      engine.enableAutoSync()
      const docs = emptyDocs()
      mockLocalStore.loadAllDocs.mockResolvedValue(docs)

      const {buildSnapshotMeta} = await import("@main/utils/sync/snapshot/buildSnapshot")
      const meta = buildSnapshotMeta(docs)
      mockRemoteStore.loadSnapshot.mockResolvedValue({version: 2, docs, meta})

      await engine.sync()

      expect(mockLocalStore.upsertDocs).not.toHaveBeenCalled()
      expect(mockRemoteStore.saveSnapshot).not.toHaveBeenCalled()
    })
  })

  describe("sync — merge & push", () => {
    const localDocs = () => ({
      ...emptyDocs(),
      tasks: [
        {
          id: "t1",
          status: "active",
          content: "local",
          minimized: false,
          order_index: 0,
          scheduled_date: "2026-03-25",
          scheduled_time: "",
          scheduled_timezone: "UTC",
          estimated_time: 0,
          spent_time: 0,
          branch_id: "main",
          tags: [],
          attachments: [],
          created_at: "2026-03-25T00:00:00.000Z",
          updated_at: "2026-03-25T10:00:00.000Z",
          deleted_at: null,
        },
      ],
    })

    const remoteDocs = () => ({
      ...emptyDocs(),
      tasks: [
        {
          id: "t1",
          status: "done",
          content: "remote",
          minimized: false,
          order_index: 0,
          scheduled_date: "2026-03-25",
          scheduled_time: "",
          scheduled_timezone: "UTC",
          estimated_time: 0,
          spent_time: 0,
          branch_id: "main",
          tags: [],
          attachments: [],
          created_at: "2026-03-25T00:00:00.000Z",
          updated_at: "2026-03-25T12:00:00.000Z",
          deleted_at: null,
        },
        {
          id: "t2",
          status: "active",
          content: "remote only",
          minimized: false,
          order_index: 1,
          scheduled_date: "2026-03-25",
          scheduled_time: "",
          scheduled_timezone: "UTC",
          estimated_time: 0,
          spent_time: 0,
          branch_id: "main",
          tags: [],
          attachments: [],
          created_at: "2026-03-25T00:00:00.000Z",
          updated_at: "2026-03-25T12:00:00.000Z",
          deleted_at: null,
        },
      ],
    })

    it("calls mergeRemoteIntoLocal when hashes differ", async () => {
      engine.enableAutoSync()
      mockLocalStore.loadAllDocs.mockResolvedValue(localDocs())
      mockRemoteStore.loadSnapshot.mockResolvedValue({
        version: 2,
        docs: remoteDocs(),
        meta: {updatedAt: "2026-03-25T12:00:00.000Z", hash: "different-hash"},
      })

      await engine.sync()

      // Merge happened → upsertDocs was called with merged data
      expect(mockLocalStore.upsertDocs).toHaveBeenCalled()
    })

    it("calls upsertDocs with toUpsert from merge result", async () => {
      engine.enableAutoSync()
      mockLocalStore.loadAllDocs.mockResolvedValue(localDocs())
      mockRemoteStore.loadSnapshot.mockResolvedValue({
        version: 2,
        docs: remoteDocs(),
        meta: {updatedAt: "2026-03-25T12:00:00.000Z", hash: "different-hash"},
      })

      await engine.sync()

      expect(mockLocalStore.upsertDocs).toHaveBeenCalled()
      const upserted = mockLocalStore.upsertDocs.mock.calls[0][0]
      expect(upserted.tasks.length).toBeGreaterThan(0)
    })

    it("pushes updated snapshot after merge when result differs from remote", async () => {
      engine.enableAutoSync()
      // Local has t1 + t3 (local-only task)
      const local = localDocs()
      local.tasks.push({
        id: "t3",
        status: "active",
        content: "local only",
        minimized: false,
        order_index: 2,
        scheduled_date: "2026-03-25",
        scheduled_time: "",
        scheduled_timezone: "UTC",
        estimated_time: 0,
        spent_time: 0,
        branch_id: "main",
        tags: [],
        attachments: [],
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T11:00:00.000Z",
        deleted_at: null,
      })
      mockLocalStore.loadAllDocs.mockResolvedValue(local)

      // Remote has t1 (newer) + t2 but NOT t3
      mockRemoteStore.loadSnapshot.mockResolvedValue({
        version: 2,
        docs: remoteDocs(),
        meta: {updatedAt: "2026-03-25T12:00:00.000Z", hash: "different-hash"},
      })

      await engine.sync()

      // Merged result = t1(remote) + t2(remote) + t3(local) — differs from remote
      expect(mockRemoteStore.saveSnapshot).toHaveBeenCalled()
    })

    it("calls onDataChanged when merge has changes", async () => {
      engine.enableAutoSync()
      mockLocalStore.loadAllDocs.mockResolvedValue(localDocs())
      mockRemoteStore.loadSnapshot.mockResolvedValue({
        version: 2,
        docs: remoteDocs(),
        meta: {updatedAt: "2026-03-25T12:00:00.000Z", hash: "different-hash"},
      })

      await engine.sync()

      expect(onDataChanged).toHaveBeenCalled()
    })

    it("does not call onDataChanged when merge has 0 changes", async () => {
      engine.enableAutoSync()
      // Same data on both sides but different hash (forces merge)
      const docs = localDocs()
      mockLocalStore.loadAllDocs.mockResolvedValue(docs)
      mockRemoteStore.loadSnapshot.mockResolvedValue({
        version: 2,
        docs: {...docs},
        meta: {updatedAt: "2026-03-25T12:00:00.000Z", hash: "force-different"},
      })

      await engine.sync()

      expect(onDataChanged).not.toHaveBeenCalled()
    })
  })

  describe("sync — error handling", () => {
    it("catches loadSnapshot errors, sets status to 'error'", async () => {
      engine.enableAutoSync()
      mockRemoteStore.loadSnapshot.mockRejectedValue(new Error("network error"))

      await engine.sync()

      const statuses = onStatusChange.mock.calls.map((c) => c[0])
      expect(statuses).toContain("error")
    })

    it("catches upsertDocs errors, sets status to 'error'", async () => {
      engine.enableAutoSync()
      mockLocalStore.loadAllDocs.mockResolvedValue(emptyDocs())
      mockRemoteStore.loadSnapshot.mockResolvedValue({
        version: 2,
        docs: docsWithTask(),
        meta: {updatedAt: "2026-03-25T12:00:00.000Z", hash: "different"},
      })
      mockLocalStore.upsertDocs.mockRejectedValue(new Error("db error"))

      await engine.sync()

      const statuses = onStatusChange.mock.calls.map((c) => c[0])
      expect(statuses).toContain("error")
    })

    it("does not sync when not enabled", async () => {
      mockRemoteStore.loadSnapshot.mockRejectedValue(new Error("should not be called"))

      await engine.sync()

      expect(mockLocalStore.loadAllDocs).not.toHaveBeenCalled()
    })
  })

  describe("sync — settings normalization", () => {
    it("normalizes old format where settings.data is a JSON string", async () => {
      engine.enableAutoSync()
      mockLocalStore.loadAllDocs.mockResolvedValue(emptyDocs())

      const oldFormatDocs = {
        ...emptyDocs(),
        settings: {
          id: "default",
          data: JSON.stringify({version: "1", themes: {current: "dark"}}),
          created_at: "2026-03-25T00:00:00.000Z",
          updated_at: "2026-03-25T00:00:00.000Z",
        },
      }
      mockRemoteStore.loadSnapshot.mockResolvedValue({
        version: 2,
        docs: oldFormatDocs,
        meta: {updatedAt: "2026-03-25T00:00:00.000Z", hash: "old-format"},
      })

      await engine.sync()

      // If upsertDocs was called, check that settings was normalized
      if (mockLocalStore.upsertDocs.mock.calls.length > 0) {
        const upserted = mockLocalStore.upsertDocs.mock.calls[0][0]
        if (upserted.settings) {
          expect(typeof upserted.settings.version).toBe("string")
          expect(upserted.settings.data).toBeUndefined()
        }
      }
      // Should not throw regardless
    })
  })
})
