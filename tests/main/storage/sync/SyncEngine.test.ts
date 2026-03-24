// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {SyncEngine} from "@main/storage/sync/SyncEngine"

vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {SYNC_ENGINE: "SYNC_ENGINE", SYNC_PULL: "SYNC_PULL", SYNC_PUSH: "SYNC_PUSH", SYNC_REMOTE: "SYNC_REMOTE"},
  },
}))

vi.mock("@/config", () => ({
  APP_CONFIG: {
    sync: {
      remoteSyncInterval: 120000,
      garbageCollectionInterval: 604800000,
      maxDeltasPerFile: 500,
      compactionThreshold: 50,
      auditRetentionInterval: 2592000000,
      auditMaxEntries: 1000,
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

// Shared mock fns accessible from tests
const mockPushDeltas = vi.fn().mockResolvedValue({deltas_pushed: 0, last_sequence: 0, error: null})
const mockPullDeltas = vi
  .fn()
  .mockResolvedValue({deltas_pulled: 0, docs_upserted: 0, docs_deleted: 0, conflicts: [], conflict_count: 0, has_changes: false, error: null})
const mockWriteEntry = vi.fn().mockResolvedValue(undefined)
const mockGetLog = vi.fn().mockResolvedValue([])
const mockPrune = vi.fn().mockResolvedValue(0)

vi.mock("@main/storage/sync/DeltaPusher", () => ({
  DeltaPusher: class {
    pushDeltas = mockPushDeltas
  },
}))

vi.mock("@main/storage/sync/DeltaPuller", () => ({
  DeltaPuller: class {
    pullDeltas = mockPullDeltas
  },
}))

vi.mock("@main/storage/sync/AuditLogger", () => ({
  AuditLogger: class {
    writeEntry = mockWriteEntry
    getLog = mockGetLog
    prune = mockPrune
  },
}))

function emptyDocs() {
  return {tasks: [], tags: [], branches: [], files: [], settings: null}
}

describe("SyncEngine", () => {
  let localStore, remoteStore, config, onStatusChange, onDataChanged, onPendingCountChanged, engine

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset default return values after clearAllMocks
    mockPushDeltas.mockResolvedValue({deltas_pushed: 0, last_sequence: 0, error: null})
    mockPullDeltas.mockResolvedValue({
      deltas_pulled: 0,
      docs_upserted: 0,
      docs_deleted: 0,
      conflicts: [],
      conflict_count: 0,
      has_changes: false,
      error: null,
    })
    mockWriteEntry.mockResolvedValue(undefined)
    mockGetLog.mockResolvedValue([])
    mockPrune.mockResolvedValue(0)

    localStore = {
      loadAllDocs: vi.fn().mockResolvedValue(emptyDocs()),
      upsertDocs: vi.fn().mockResolvedValue(undefined),
      deleteDocs: vi.fn().mockResolvedValue(undefined),
      getUnsyncedChanges: vi.fn().mockResolvedValue([]),
      getChangesSince: vi.fn().mockResolvedValue([]),
      markChangesSynced: vi.fn().mockResolvedValue(undefined),
      applyRemoteDeltas: vi
        .fn()
        .mockResolvedValue({remote_deltas_processed: 0, docs_upserted: 0, docs_deleted: 0, conflicts: [], conflict_count: 0, updated_cursors: {}}),
      writeSyncAudit: vi.fn().mockResolvedValue(undefined),
      getSyncAuditLog: vi.fn().mockResolvedValue([]),
      pruneSyncAudit: vi.fn().mockResolvedValue(0),
      getDeviceId: vi.fn().mockResolvedValue("test-device"),
    }
    remoteStore = {
      loadBaseline: vi.fn().mockResolvedValue(null),
      saveBaseline: vi.fn().mockResolvedValue(undefined),
      listDeviceManifests: vi.fn().mockResolvedValue([]),
      loadDeviceManifest: vi.fn().mockResolvedValue(null),
      saveDeviceManifest: vi.fn().mockResolvedValue(undefined),
      loadDeltas: vi.fn().mockResolvedValue([]),
      saveDeltaFile: vi.fn().mockResolvedValue(undefined),
      pruneDeltas: vi.fn().mockResolvedValue(0),
      syncAssets: vi.fn().mockResolvedValue(undefined),
    }
    config = {
      remoteSyncInterval: 120000,
      garbageCollectionInterval: 604800000,
      maxDeltasPerFile: 500,
      compactionThreshold: 50,
      auditRetentionInterval: 2592000000,
      auditMaxEntries: 1000,
    }
    onStatusChange = vi.fn()
    onDataChanged = vi.fn()
    onPendingCountChanged = vi.fn()

    engine = new SyncEngine(localStore, remoteStore, config, onStatusChange, onDataChanged, onPendingCountChanged)
  })

  it("does not sync when not enabled", async () => {
    await engine.sync()
    expect(onStatusChange).not.toHaveBeenCalledWith("syncing", expect.anything())
  })

  it("transitions status: inactive → active → syncing → active", async () => {
    await engine.enableAutoSync()
    expect(onStatusChange).toHaveBeenCalledWith("active", "inactive")

    await engine.sync()
    const calls = onStatusChange.mock.calls.map((c) => c[0])
    expect(calls).toContain("syncing")
    expect(calls[calls.length - 1]).toBe("active")
  })

  it("sets status to error when sync fails", async () => {
    await engine.enableAutoSync()
    mockPushDeltas.mockRejectedValue(new Error("DB error"))

    await engine.sync()

    const calls = onStatusChange.mock.calls.map((c) => c[0])
    expect(calls).toContain("error")
  })

  it("fires onDataChanged when pull has changes", async () => {
    await engine.enableAutoSync()
    mockPullDeltas.mockResolvedValue({
      deltas_pulled: 5,
      docs_upserted: 3,
      docs_deleted: 0,
      conflicts: [],
      conflict_count: 0,
      has_changes: true,
      error: null,
    })

    await engine.sync()

    expect(onDataChanged).toHaveBeenCalled()
  })

  it("does NOT fire onDataChanged when no changes", async () => {
    await engine.enableAutoSync()
    await engine.sync()
    expect(onDataChanged).not.toHaveBeenCalled()
  })

  it("getPendingChangesCount returns unsynced count", async () => {
    localStore.getUnsyncedChanges.mockResolvedValue([{id: 1}, {id: 2}, {id: 3}])
    const count = await engine.getPendingChangesCount()
    expect(count).toBe(3)
  })
})
