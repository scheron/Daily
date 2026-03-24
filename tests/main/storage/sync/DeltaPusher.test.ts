// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {DeltaPusher} from "@main/storage/sync/DeltaPusher"

vi.mock("@/utils/logger", () => ({
  logger: {warn: vi.fn(), error: vi.fn(), CONTEXT: {SYNC_REMOTE: "SYNC_REMOTE"}},
}))

describe("DeltaPusher", () => {
  let localStore
  let remoteStore
  let config
  let pusher

  beforeEach(() => {
    localStore = {
      getUnsyncedChanges: vi.fn(),
      markChangesSynced: vi.fn(),
    }
    remoteStore = {
      saveDeltaFile: vi.fn(),
      saveDeviceManifest: vi.fn(),
      loadDeviceManifest: vi.fn().mockResolvedValue(null),
    }
    config = {
      remoteSyncInterval: 120000,
      garbageCollectionInterval: 604800000,
      maxDeltasPerFile: 500,
      compactionThreshold: 50,
      auditRetentionInterval: 2592000000,
      auditMaxEntries: 1000,
    }
    pusher = new DeltaPusher(localStore, remoteStore, config)
  })

  it("returns early when no unsynced changes", async () => {
    localStore.getUnsyncedChanges.mockResolvedValue([])
    const result = await pusher.pushDeltas("dev1", "MacBook")
    expect(result.deltas_pushed).toBe(0)
    expect(remoteStore.saveDeltaFile).not.toHaveBeenCalled()
  })

  it("pushes changes as delta file", async () => {
    const entries = Array.from({length: 5}, (_, i) => ({
      id: i + 1,
      doc_id: `t${i}`,
      entity: "task",
      operation: "update",
      field_name: "content",
      old_value: null,
      new_value: `'v${i}'`,
      changed_at: "2026-03-24T12:00:00.000Z",
      sequence: i + 1,
      device_id: "dev1",
      synced: 0,
    }))
    localStore.getUnsyncedChanges.mockResolvedValue(entries)

    const result = await pusher.pushDeltas("dev1", "MacBook")

    expect(result.deltas_pushed).toBe(5)
    expect(result.last_sequence).toBe(5)
    expect(remoteStore.saveDeltaFile).toHaveBeenCalledTimes(1)
    expect(remoteStore.saveDeviceManifest).toHaveBeenCalledTimes(1)
    expect(localStore.markChangesSynced).toHaveBeenCalledWith(5)

    // Verify delta records strip id and synced
    const deltaFile = remoteStore.saveDeltaFile.mock.calls[0][0]
    expect(deltaFile.deltas[0].id).toBeUndefined()
    expect(deltaFile.deltas[0].synced).toBeUndefined()
  })

  it("splits large batches", async () => {
    const entries = Array.from({length: 600}, (_, i) => ({
      id: i + 1,
      doc_id: `t${i}`,
      entity: "task",
      operation: "update",
      field_name: "content",
      old_value: null,
      new_value: `'v${i}'`,
      changed_at: "2026-03-24T12:00:00.000Z",
      sequence: i + 1,
      device_id: "dev1",
      synced: 0,
    }))
    localStore.getUnsyncedChanges.mockResolvedValue(entries)

    const result = await pusher.pushDeltas("dev1", "MacBook")

    expect(remoteStore.saveDeltaFile).toHaveBeenCalledTimes(2) // 500 + 100
    expect(result.deltas_pushed).toBe(600)
  })

  it("remote write failure returns error", async () => {
    localStore.getUnsyncedChanges.mockResolvedValue([
      {
        id: 1,
        doc_id: "t1",
        entity: "task",
        operation: "update",
        field_name: "content",
        old_value: null,
        new_value: "'v'",
        changed_at: "2026-03-24T12:00:00.000Z",
        sequence: 1,
        device_id: "dev1",
        synced: 0,
      },
    ])
    remoteStore.saveDeltaFile.mockRejectedValue(new Error("iCloud write failed"))

    const result = await pusher.pushDeltas("dev1", "MacBook")

    expect(result.error).toBe("iCloud write failed")
    expect(result.deltas_pushed).toBe(0)
    expect(localStore.markChangesSynced).not.toHaveBeenCalled()
  })
})
