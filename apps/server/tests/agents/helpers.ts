import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"

import {dataPaths} from "@daily/core/config/paths"
import {createStorageCore} from "@daily/core/storage/createStorageCore"
import {runMigrations} from "@daily/core/storage/database/scripts/migrate"
import {KNOWN_SNAPSHOT_VERSION} from "@daily/core/utils/sync/snapshot/assertKnownSnapshotVersion"
import {buildSnapshot} from "@daily/core/utils/sync/snapshot/buildSnapshot"

import {createDevice} from "../../src/devices/DeviceStore"
import {writeSnapshotIfUnchanged} from "../../src/snapshot/SnapshotStore"
import {createBetterSqliteDriver} from "../../src/store/betterSqliteDriver"
import {openServerStore} from "../../src/store/instance"

import type {StorageCore} from "@daily/core/storage/createStorageCore"
import type {SqliteDriver} from "../../src/store/betterSqliteDriver"
import type {ServerStore} from "../../src/store/instance"

export type MacCore = {core: StorageCore; db: SqliteDriver; root: string; close(): void}

/**
 * A throwaway storage core over a real, temp-file SQLite database, migrated and bootstrapped
 * exactly the way the app's own `StorageController` builds one — the "Mac" a test seeds fixtures
 * through before handing them to the server as a snapshot.
 */
export function openMacCore(): MacCore {
  const root = mkdtempSync(join(tmpdir(), "daily-agent-mac-"))
  const db = createBetterSqliteDriver(join(root, "mac.sqlite"))
  runMigrations(db)

  const core = createStorageCore(db, {...dataPaths(() => root), remoteSyncPath: () => root})

  return {
    core,
    db,
    root,
    close: () => {
      db.close()
      rmSync(root, {recursive: true, force: true})
    },
  }
}

/**
 * Binds a device to `store` the way claiming or enrolling one does, and hands back its id — the
 * only form of device id `written_by_device_id`'s foreign key accepts, and so the only one a
 * write-mode call or a seeded snapshot may carry.
 */
export function bindDevice(store: ServerStore, name = "Bound Mac"): string {
  return createDevice(store, name).device.id
}

/** An `AgentIdentity` naming a freshly bound device — the shape a write-mode call needs, since `written_by_device_id` is a real foreign key. */
export function bindAgent(store: ServerStore, name = "Agent Mac", timeZone = "UTC"): {deviceId: string; timeZone: string} {
  return {deviceId: bindDevice(store, name), timeZone}
}

/** Loads every document off `mac`'s core and writes it into `store` exactly as a Mac's sync would, through `buildSnapshot`. */
export async function writeMacSnapshot(store: ServerStore, mac: MacCore, expectedRevision: string | null, deviceId: string): Promise<string> {
  const docs = await mac.core.localAdapter.loadAllDocs()
  const snapshot = buildSnapshot(docs)

  return writeSnapshotIfUnchanged(store, snapshot, expectedRevision, deviceId)
}

/** A fixture task draft `createTask` accepts, overridden per case rather than hand-copied. */
export function makeTaskDraft(overrides: Record<string, unknown> = {}): any {
  return {
    content: "Task",
    status: "active",
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: "2026-03-24", time: "09:00:00", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    milestoneId: null,
    tags: [],
    attachments: [],
    deletedAt: null,
    ...overrides,
  }
}

/** A structurally valid, empty `StoredSnapshotDocument`, overridden per case to build a specific edge — never a hand-copied object per case. */
export function rawSnapshotDocument(overrides: Record<string, unknown> = {}): any {
  return {
    version: KNOWN_SNAPSHOT_VERSION,
    meta: {updatedAt: "2026-01-01T00:00:00.000Z", hash: "hash-1"},
    docs: {tasks: [], tags: [], branches: [], milestones: [], relations: [], comments: [], files: [], events: []},
    ...overrides,
  }
}

const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Bytes `sniffImageExt` recognises as a PNG, padded to `size` — enough to exercise a real image file end to end. */
export function makePngBytes(size = 64): Buffer {
  return Buffer.concat([PNG_MAGIC_BYTES, Buffer.alloc(Math.max(size - PNG_MAGIC_BYTES.length, 0))])
}

export type SeededStore = {store: ServerStore; dataDir: string; mac: MacCore; revision: string; deviceId: string; close(): void}

/**
 * A real server store in a temp directory, holding one Mac's snapshot at revision `"1"` — `main`
 * and nothing else, exactly what `createStorageCore` bootstraps on its own. `seed` runs against
 * the Mac's own core before that first write, so a test can build whatever fixtures it needs
 * through the real services rather than a hand-rolled snapshot document.
 */
export async function seedAgentStore(seed?: (mac: MacCore) => Promise<void> | void, deviceName = "Seed Mac"): Promise<SeededStore> {
  const dataDir = mkdtempSync(join(tmpdir(), "daily-agent-store-"))
  const store = openServerStore(dataDir)
  const mac = openMacCore()
  const deviceId = bindDevice(store, deviceName)

  if (seed) await seed(mac)

  const revision = await writeMacSnapshot(store, mac, null, deviceId)

  return {
    store,
    dataDir,
    mac,
    revision,
    deviceId,
    close: () => {
      store.close()
      mac.close()
      rmSync(dataDir, {recursive: true, force: true})
    },
  }
}
