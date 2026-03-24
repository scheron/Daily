// @ts-nocheck
import {mkdtemp, rm} from "fs/promises"
import {tmpdir} from "os"
import {join} from "path"
import fs from "fs-extra"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {RemoteStorageAdapter} from "@main/storage/sync/adapters/RemoteStorageAdapter"

vi.mock("@/utils/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {SYNC_REMOTE: "SYNC_REMOTE"},
  },
}))

vi.mock("@/utils/fileCoordinator", () => ({
  coordinatedRead: vi.fn(async (path) => {
    try {
      return await fs.readFile(path)
    } catch {
      return null
    }
  }),
  coordinatedWrite: vi.fn(async (path, data) => {
    await fs.writeFile(path, data)
  }),
  isICloudStub: vi.fn(() => false),
  requestDownload: vi.fn(),
}))

describe("RemoteStorageAdapter", () => {
  let syncDir
  let adapter

  beforeEach(async () => {
    syncDir = await mkdtemp(join(tmpdir(), "remote-adapter-test-"))
    adapter = new RemoteStorageAdapter(syncDir)
  })

  afterEach(async () => {
    await rm(syncDir, {recursive: true, force: true})
  })

  const sampleBaseline = {
    version: 3,
    docs: {tasks: [], tags: [], branches: [], files: [], settings: null},
    meta: {created_at: "2026-03-24T12:00:00.000Z", hash: "abc123", watermarks: {}},
  }

  const sampleManifest = {
    version: 3,
    device_id: "device-a",
    device_name: "MacBook",
    last_sequence: 10,
    last_written_at: "2026-03-24T12:00:00.000Z",
    cursors: {},
  }

  const sampleDeltaFile = {
    version: 3,
    device_id: "device-a",
    sequence_from: 1,
    sequence_to: 10,
    created_at: "2026-03-24T12:00:00.000Z",
    deltas: Array.from({length: 10}, (_, i) => ({
      doc_id: `task-${i + 1}`,
      entity: "task",
      operation: "update",
      field_name: "content",
      old_value: null,
      new_value: `'content ${i + 1}'`,
      changed_at: "2026-03-24T12:00:00.000Z",
      sequence: i + 1,
      device_id: "device-a",
    })),
  }

  describe("saveBaseline + loadBaseline", () => {
    it("saves and loads a Snapshot", async () => {
      await adapter.saveBaseline(sampleBaseline)

      const baselinePath = join(syncDir, "baseline", "snapshot.v3.json")
      expect(await fs.pathExists(baselinePath)).toBe(true)

      const loaded = await adapter.loadBaseline()
      expect(loaded).toEqual(sampleBaseline)
    })

    it("returns null when no baseline exists", async () => {
      const result = await adapter.loadBaseline()
      expect(result).toBeNull()
    })
  })

  describe("saveDeviceManifest + loadDeviceManifest", () => {
    it("saves and loads a manifest", async () => {
      await adapter.saveDeviceManifest(sampleManifest)

      const loaded = await adapter.loadDeviceManifest("device-a")
      expect(loaded).toEqual(sampleManifest)
    })

    it("returns null when no manifest exists", async () => {
      const result = await adapter.loadDeviceManifest("nonexistent")
      expect(result).toBeNull()
    })
  })

  describe("listDeviceManifests", () => {
    it("lists manifests from multiple devices", async () => {
      await adapter.saveDeviceManifest(sampleManifest)
      await adapter.saveDeviceManifest({...sampleManifest, device_id: "device-b", device_name: "iMac"})

      const manifests = await adapter.listDeviceManifests()
      expect(manifests.length).toBe(2)
    })

    it("returns empty when no deltas dir", async () => {
      const manifests = await adapter.listDeviceManifests()
      expect(manifests).toEqual([])
    })
  })

  describe("saveDeltaFile + loadDeltas", () => {
    it("saves and loads delta records", async () => {
      await adapter.saveDeltaFile(sampleDeltaFile)

      const deltas = await adapter.loadDeltas("device-a", 0)
      expect(deltas.length).toBe(10)

      // Filter by afterSequence
      const filtered = await adapter.loadDeltas("device-a", 5)
      expect(filtered.length).toBe(5)
      expect(filtered[0].sequence).toBe(6)
    })

    it("loads from multiple delta files", async () => {
      await adapter.saveDeltaFile(sampleDeltaFile)
      await adapter.saveDeltaFile({
        ...sampleDeltaFile,
        sequence_from: 11,
        sequence_to: 20,
        deltas: Array.from({length: 10}, (_, i) => ({
          doc_id: `task-${i + 11}`,
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: `'content ${i + 11}'`,
          changed_at: "2026-03-24T12:00:00.000Z",
          sequence: i + 11,
          device_id: "device-a",
        })),
      })

      const deltas = await adapter.loadDeltas("device-a", 5)
      expect(deltas.length).toBe(15) // 6-10 from first + 11-20 from second
    })

    it("returns empty for nonexistent device", async () => {
      const deltas = await adapter.loadDeltas("nonexistent", 0)
      expect(deltas).toEqual([])
    })
  })

  describe("pruneDeltas", () => {
    it("removes delta files covered by watermark", async () => {
      await adapter.saveDeltaFile(sampleDeltaFile) // 1-10
      await adapter.saveDeltaFile({
        ...sampleDeltaFile,
        sequence_from: 11,
        sequence_to: 20,
        deltas: [
          {
            doc_id: "t",
            entity: "task",
            operation: "update",
            field_name: "x",
            old_value: null,
            new_value: "y",
            changed_at: "2026-03-24T12:00:00.000Z",
            sequence: 11,
            device_id: "device-a",
          },
        ],
      })

      const deleted = await adapter.pruneDeltas({"device-a": 10})
      expect(deleted).toBe(1) // 1-10.json removed

      // 11-20 should remain
      const remaining = await adapter.loadDeltas("device-a", 0)
      expect(remaining.length).toBe(1)
    })
  })

  describe("existing methods still work", () => {
    it("syncAssets is callable", async () => {
      await expect(adapter.syncAssets("/tmp/assets", [])).resolves.not.toThrow()
    })
  })
})
