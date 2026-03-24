// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {MigrationBridge} from "@main/storage/sync/MigrationBridge"

vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {SYNC_ENGINE: "SYNC_ENGINE"},
  },
}))

vi.mock("@/utils/sync/merge/mergeRemoteIntoLocal", () => ({
  mergeRemoteIntoLocal: vi.fn(() => ({
    resultDocs: {tasks: [], tags: [], branches: [], files: [], settings: null},
    toUpsert: {tasks: [], tags: [], branches: [], files: [], settings: null},
    toRemove: {},
    changes: 0,
  })),
}))

vi.mock("@/utils/sync/snapshot/buildSnapshot", () => ({
  buildSnapshotMeta: vi.fn(() => ({updatedAt: "2026-03-24T12:00:00.000Z", hash: "abc123"})),
}))

function emptyDocs() {
  return {tasks: [], tags: [], branches: [], files: [], settings: null}
}

describe("MigrationBridge", () => {
  let localStore, remoteStore, bridge

  beforeEach(() => {
    localStore = {
      loadAllDocs: vi.fn().mockResolvedValue(emptyDocs()),
      upsertDocs: vi.fn().mockResolvedValue(undefined),
    }
    remoteStore = {
      loadBaseline: vi.fn().mockResolvedValue(null),
      saveBaseline: vi.fn().mockResolvedValue(undefined),
      loadLegacySnapshot: vi.fn().mockResolvedValue(null),
      deleteLegacySnapshot: vi.fn().mockResolvedValue(undefined),
      saveDeviceManifest: vi.fn().mockResolvedValue(undefined),
    }
    bridge = new MigrationBridge(localStore, remoteStore)
  })

  describe("needsMigration", () => {
    it("true when v2 exists and no v3", async () => {
      remoteStore.loadBaseline.mockResolvedValue(null)
      remoteStore.loadLegacySnapshot.mockResolvedValue({version: 2, docs: emptyDocs(), meta: {updatedAt: "", hash: ""}})
      expect(await bridge.needsMigration()).toBe(true)
    })

    it("false when v3 exists", async () => {
      remoteStore.loadBaseline.mockResolvedValue({version: 3, docs: emptyDocs(), meta: {created_at: "", hash: "", watermarks: {}}})
      expect(await bridge.needsMigration()).toBe(false)
    })

    it("false when no v2", async () => {
      remoteStore.loadBaseline.mockResolvedValue(null)
      remoteStore.loadLegacySnapshot.mockResolvedValue(null)
      expect(await bridge.needsMigration()).toBe(false)
    })
  })

  describe("migrate", () => {
    it("imports v2 and creates v3", async () => {
      remoteStore.loadLegacySnapshot.mockResolvedValue({version: 2, docs: emptyDocs(), meta: {updatedAt: "", hash: ""}})

      await bridge.migrate("dev1", "MacBook")

      expect(remoteStore.loadLegacySnapshot).toHaveBeenCalled()
      expect(remoteStore.saveBaseline).toHaveBeenCalled()
      expect(remoteStore.saveDeviceManifest).toHaveBeenCalled()
      expect(remoteStore.deleteLegacySnapshot).toHaveBeenCalled()
    })

    it("deleteLegacySnapshot failure is non-fatal", async () => {
      remoteStore.loadLegacySnapshot.mockResolvedValue({version: 2, docs: emptyDocs(), meta: {updatedAt: "", hash: ""}})
      remoteStore.deleteLegacySnapshot.mockRejectedValue(new Error("permission denied"))

      await expect(bridge.migrate("dev1", "MacBook")).resolves.not.toThrow()
    })
  })

  describe("needsBootstrap", () => {
    it("true when v3 exists and local empty", async () => {
      remoteStore.loadBaseline.mockResolvedValue({version: 3, docs: emptyDocs(), meta: {created_at: "", hash: "", watermarks: {}}})
      localStore.loadAllDocs.mockResolvedValue(emptyDocs())
      expect(await bridge.needsBootstrap()).toBe(true)
    })

    it("false when no baseline", async () => {
      remoteStore.loadBaseline.mockResolvedValue(null)
      expect(await bridge.needsBootstrap()).toBe(false)
    })
  })

  describe("bootstrap", () => {
    it("applies baseline to local", async () => {
      const docs = {tasks: [{id: "t1"}], tags: [], branches: [], files: [], settings: null}
      remoteStore.loadBaseline.mockResolvedValue({version: 3, docs, meta: {created_at: "", hash: "", watermarks: {dev2: 10}}})

      await bridge.bootstrap("dev1", "MacBook", "pull")

      expect(localStore.upsertDocs).toHaveBeenCalledWith(docs)
      expect(remoteStore.saveDeviceManifest).toHaveBeenCalled()
    })
  })
})
