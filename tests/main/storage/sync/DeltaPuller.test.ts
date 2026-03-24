// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {DeltaPuller} from "@main/storage/sync/DeltaPuller"

vi.mock("@/utils/logger", () => ({
  logger: {warn: vi.fn(), error: vi.fn(), CONTEXT: {SYNC_REMOTE: "SYNC_REMOTE"}},
}))

vi.mock("@/utils/sync/merge/FieldMerger", () => ({
  mergeFields: vi.fn(() => ({patches: [], conflicts: []})),
}))

describe("DeltaPuller", () => {
  let localStore
  let remoteStore
  let config
  let puller

  beforeEach(() => {
    localStore = {
      getUnsyncedChanges: vi.fn().mockResolvedValue([]),
      applyRemoteDeltas: vi.fn().mockResolvedValue({
        remote_deltas_processed: 0,
        docs_upserted: 0,
        docs_deleted: 0,
        conflicts: [],
        conflict_count: 0,
        updated_cursors: {},
      }),
    }
    remoteStore = {
      listDeviceManifests: vi.fn().mockResolvedValue([]),
      loadDeviceManifest: vi.fn().mockResolvedValue(null),
      loadDeltas: vi.fn().mockResolvedValue([]),
      saveDeviceManifest: vi.fn(),
    }
    config = {
      remoteSyncInterval: 120000,
      garbageCollectionInterval: 604800000,
      maxDeltasPerFile: 500,
      compactionThreshold: 50,
      auditRetentionInterval: 2592000000,
      auditMaxEntries: 1000,
    }
    puller = new DeltaPuller(localStore, remoteStore, config)
  })

  it("returns early when no remote manifests", async () => {
    const result = await puller.pullDeltas("dev1", "pull")
    expect(result.has_changes).toBe(false)
    expect(result.deltas_pulled).toBe(0)
  })

  it("returns early when no new deltas", async () => {
    remoteStore.listDeviceManifests.mockResolvedValue([
      {version: 3, device_id: "dev2", device_name: "iMac", last_sequence: 5, last_written_at: "", cursors: {}},
    ])
    remoteStore.loadDeviceManifest.mockResolvedValue({
      version: 3,
      device_id: "dev1",
      device_name: "MacBook",
      last_sequence: 0,
      last_written_at: "",
      cursors: {dev2: 5},
    })

    const result = await puller.pullDeltas("dev1", "pull")
    expect(remoteStore.loadDeltas).not.toHaveBeenCalled()
  })

  it("pulls and applies new deltas", async () => {
    const deltas = [
      {
        doc_id: "t1",
        entity: "task",
        operation: "update",
        field_name: "content",
        old_value: null,
        new_value: "'new'",
        changed_at: "2026-03-24T12:00:00.000Z",
        sequence: 1,
        device_id: "dev2",
      },
    ]
    remoteStore.listDeviceManifests.mockResolvedValue([
      {version: 3, device_id: "dev2", device_name: "iMac", last_sequence: 1, last_written_at: "", cursors: {}},
    ])
    remoteStore.loadDeltas.mockResolvedValue(deltas)
    localStore.applyRemoteDeltas.mockResolvedValue({
      remote_deltas_processed: 1,
      docs_upserted: 1,
      docs_deleted: 0,
      conflicts: [],
      conflict_count: 0,
      updated_cursors: {dev2: 1},
    })

    const result = await puller.pullDeltas("dev1", "pull")

    expect(remoteStore.loadDeltas).toHaveBeenCalledWith("dev2", 0)
    expect(localStore.applyRemoteDeltas).toHaveBeenCalled()
    expect(remoteStore.saveDeviceManifest).toHaveBeenCalled()
    expect(result.has_changes).toBe(true)
    expect(result.docs_upserted).toBe(1)
  })

  it("pulls from multiple remote devices", async () => {
    remoteStore.listDeviceManifests.mockResolvedValue([
      {version: 3, device_id: "dev2", device_name: "iMac", last_sequence: 5, last_written_at: "", cursors: {}},
      {version: 3, device_id: "dev3", device_name: "iPad", last_sequence: 3, last_written_at: "", cursors: {}},
    ])
    remoteStore.loadDeltas.mockResolvedValue([
      {
        doc_id: "t1",
        entity: "task",
        operation: "update",
        field_name: "content",
        old_value: null,
        new_value: "'x'",
        changed_at: "2026-03-24T12:00:00.000Z",
        sequence: 1,
        device_id: "dev2",
      },
    ])
    localStore.applyRemoteDeltas.mockResolvedValue({
      remote_deltas_processed: 2,
      docs_upserted: 2,
      docs_deleted: 0,
      conflicts: [],
      conflict_count: 0,
      updated_cursors: {},
    })

    const result = await puller.pullDeltas("dev1", "pull")

    expect(remoteStore.loadDeltas).toHaveBeenCalledTimes(2)
  })

  it("skips own device", async () => {
    remoteStore.listDeviceManifests.mockResolvedValue([
      {version: 3, device_id: "dev1", device_name: "MacBook", last_sequence: 10, last_written_at: "", cursors: {}},
    ])

    const result = await puller.pullDeltas("dev1", "pull")
    expect(remoteStore.loadDeltas).not.toHaveBeenCalled()
  })

  it("result reflects merge output", async () => {
    remoteStore.listDeviceManifests.mockResolvedValue([
      {version: 3, device_id: "dev2", device_name: "iMac", last_sequence: 5, last_written_at: "", cursors: {}},
    ])
    remoteStore.loadDeltas.mockResolvedValue([
      {
        doc_id: "t1",
        entity: "task",
        operation: "update",
        field_name: "content",
        old_value: null,
        new_value: "'x'",
        changed_at: "2026-03-24T12:00:00.000Z",
        sequence: 1,
        device_id: "dev2",
      },
    ])
    localStore.applyRemoteDeltas.mockResolvedValue({
      remote_deltas_processed: 1,
      docs_upserted: 3,
      docs_deleted: 1,
      conflicts: [],
      conflict_count: 0,
      updated_cursors: {},
    })

    const result = await puller.pullDeltas("dev1", "pull")
    expect(result.docs_upserted).toBe(3)
    expect(result.has_changes).toBe(true)
  })
})
