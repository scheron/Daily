// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {SyncEngine} from "@main/storage/sync/SyncEngine"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {SYNC_ENGINE: "SYNC_ENGINE", SYNC_PULL: "SYNC_PULL", SYNC_PUSH: "SYNC_PUSH"},
  },
}))

vi.mock("@main/config", () => ({
  APP_CONFIG: {sync: {remoteSyncInterval: 300_000, garbageCollectionInterval: 604_800_000}},
  fsPaths: {assetsDir: () => "/tmp/assets"},
}))

vi.mock("@main/utils/AsyncMutex", () => ({
  AsyncMutex: class {
    async runExclusive(fn) {
      return fn()
    }
  },
}))

vi.mock("@main/utils/createIntervalScheduler", () => ({
  createIntervalScheduler: () => ({start: vi.fn(), stop: vi.fn()}),
}))

vi.mock("@shared/utils/common/withElapsedDelay", () => ({
  withElapsedDelay: async (fn) => fn(),
}))

function emptyDocs() {
  return {tasks: [], tags: [], branches: [], files: [], settings: null}
}

function makeDocs(overrides = {}) {
  return {...emptyDocs(), ...overrides}
}

describe("SyncEngine", () => {
  let localStore, remoteStore, onStatusChange, onDataChanged, engine

  beforeEach(() => {
    localStore = {
      loadAllDocs: vi.fn().mockResolvedValue(emptyDocs()),
      upsertDocs: vi.fn().mockResolvedValue(undefined),
      deleteDocs: vi.fn().mockResolvedValue(undefined),
    }
    remoteStore = {
      loadSnapshot: vi.fn().mockResolvedValue(null),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      syncAssets: vi.fn().mockResolvedValue(undefined),
    }
    onStatusChange = vi.fn()
    onDataChanged = vi.fn()

    engine = new SyncEngine(localStore, remoteStore, {onStatusChange, onDataChanged})
  })

  it("does not sync when not enabled", async () => {
    await engine.sync()

    expect(localStore.loadAllDocs).not.toHaveBeenCalled()
  })

  it("transitions status: inactive → active → syncing → active", async () => {
    engine.enableAutoSync()

    expect(onStatusChange).toHaveBeenCalledWith("active", "inactive")

    await engine.sync()

    const calls = onStatusChange.mock.calls.map((c) => c[0])
    expect(calls).toContain("syncing")
    expect(calls[calls.length - 1]).toBe("active")
  })

  it("pushes to remote when no remote snapshot exists and local has data", async () => {
    const now = new Date().toISOString()
    localStore.loadAllDocs.mockResolvedValue(
      makeDocs({
        tasks: [{id: "t1", updated_at: now, deleted_at: null}],
      }),
    )
    remoteStore.loadSnapshot.mockResolvedValue(null)

    engine.enableAutoSync()
    await engine.sync()

    expect(remoteStore.saveSnapshot).toHaveBeenCalled()
  })

  it("skips sync when hashes match", async () => {
    const now = new Date().toISOString()
    const docs = makeDocs({branches: [{id: "main", name: "Main", updated_at: now, deleted_at: null, created_at: now}]})
    localStore.loadAllDocs.mockResolvedValue(docs)

    // Import buildSnapshot to create a valid snapshot
    const {buildSnapshot, buildSnapshotMeta} = await import("@main/utils/sync/snapshot/buildSnapshot")
    const snapshot = buildSnapshot(docs)
    remoteStore.loadSnapshot.mockResolvedValue(snapshot)

    engine.enableAutoSync()
    await engine.sync()

    // No upsert or push since hashes match
    expect(localStore.upsertDocs).not.toHaveBeenCalled()
    expect(remoteStore.saveSnapshot).not.toHaveBeenCalled()
  })

  it("calls onDataChanged when pull introduces changes", async () => {
    const now = new Date().toISOString()
    localStore.loadAllDocs.mockResolvedValue(emptyDocs())

    const {buildSnapshot} = await import("@main/utils/sync/snapshot/buildSnapshot")
    const remoteDocs = makeDocs({
      tags: [{id: "t1", name: "Work", color: "#000", updated_at: now, deleted_at: null, created_at: now}],
    })
    remoteStore.loadSnapshot.mockResolvedValue(buildSnapshot(remoteDocs))

    engine.enableAutoSync()
    await engine.sync()

    expect(onDataChanged).toHaveBeenCalled()
    expect(localStore.upsertDocs).toHaveBeenCalled()
  })

  it("sets status to error when sync fails", async () => {
    localStore.loadAllDocs.mockRejectedValue(new Error("DB error"))

    engine.enableAutoSync()
    await engine.sync()

    const calls = onStatusChange.mock.calls.map((c) => c[0])
    expect(calls).toContain("error")
  })
})
