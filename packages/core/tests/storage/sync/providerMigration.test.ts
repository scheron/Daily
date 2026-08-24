/**
 * Drives `ProviderMigrationService` against a real SQLite database, a real in-process Daily Sync
 * Server (`packages/core/tests/helpers/syncServer.ts`) and a real temp directory standing in for iCloud. Nothing
 * about the migration itself is stubbed: the service is wired to the real `SyncEngine`, the real
 * `LocalStorageAdapter`, the real `ICloudRemoteAdapter`/`DailyServerRemoteAdapter` and the real
 * merge code under `src/main/utils/sync/merge/`.
 *
 * `ProviderMigrationService` is not composed by `StorageController` yet at this dispatch (phase 2
 * adds that). Its dependency shape (frozen in the plan's phase 2) is exactly what
 * `StorageController` will pass it, so the rig below wires the same functions
 * `StorageController.applyRemoteConfiguration`/`saveSettings` already implement today — reusing
 * `SyncEngine` and `resolveActiveProvider`/`buildSyncRemotes`, never reimplementing them — rather
 * than constructing a full `StorageController` (which requires a real Electron `app` for its path
 * fields and is out of this file's seam).
 */
import {mkdtemp, rm} from "fs/promises"
import {tmpdir} from "os"
import {basename, dirname, join} from "path"
import fs from "fs-extra"
import {afterEach, describe, expect, it, vi} from "vitest"

import {resolveActiveProvider, SyncServerError, SyncServerErrorCode} from "@daily/protocol"

import {buildSyncRemotes} from "../../../src/utils/sync/syncProvider"
import {createStorageCore} from "../../../src/storage/createStorageCore"
import {getDefaultSettings} from "../../../src/storage/models/_rowMappers"
import {DailyServerRemoteAdapter} from "../../../src/storage/sync/adapters/DailyServerRemoteAdapter"
import {ICloudRemoteAdapter} from "../../../src/storage/sync/adapters/ICloudRemoteAdapter"
import {LocalStorageAdapter} from "../../../src/storage/sync/adapters/LocalStorageAdapter"
import {ProviderMigrationService} from "../../../src/storage/sync/ProviderMigrationService"
import {ServerProviderService} from "../../../src/storage/sync/server/ServerProviderService"
import {SyncEngine} from "../../../src/storage/sync/SyncEngine"
import {createTestDatabase} from "../../helpers/db"
import {bootSyncServer, claimFirstDevice} from "../../helpers/syncServer"

import type {IssuedCredential, ServerSyncBinding, Settings, SyncSettings} from "@daily/protocol"
import type Database from "better-sqlite3"
import type {AppPaths} from "../../../src/config/paths"
import type {StorageCore} from "../../../src/storage/createStorageCore"
import type {BootedSyncServer} from "../../helpers/syncServer"

/**
 * `ICloudRemoteAdapter` reads/writes through `../../../src/utils/fileCoordinator`, whose real implementation
 * assumes a genuine iCloud-managed path. Standing a plain temp directory in for iCloud (the
 * technique `packages/core/tests/storage/sync/integration.test.ts` already uses) needs this same mock.
 */
vi.mock("../../../src/utils/fileCoordinator", () => ({
  coordinatedRead: vi.fn(async (path: string) => {
    try {
      return await fs.readFile(path)
    } catch {
      return null
    }
  }),
  coordinatedWrite: vi.fn(async (path: string, data: Buffer) => {
    await fs.writeFile(path, data)
  }),
  getICloudStubPath: vi.fn((path: string) => join(dirname(path), `.${basename(path)}.icloud`)),
  hasICloudStub: vi.fn(async (path: string) => fs.pathExists(join(dirname(path), `.${basename(path)}.icloud`))),
  isICloudStub: vi.fn(() => false),
  requestDownload: vi.fn(),
  requestDownloadAndWait: vi.fn(async (path: string) => {
    const stubPath = join(dirname(path), `.${basename(path)}.icloud`)
    const [fileExists, stubExists] = await Promise.all([fs.pathExists(path), fs.pathExists(stubPath)])
    return fileExists && !stubExists
  }),
}))

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

type TaskOpts = {date?: string; updatedAt?: string; deletedAt?: string | null}

function insertTask(db: Database.Database, id: string, content: string, opts: TaskOpts = {}): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
     VALUES (?, 'active', ?, 0, 0, ?, '', 'UTC', 0, 0, 'main', ?, ?, ?)`,
  ).run(id, content, opts.date ?? "2026-03-25", now, opts.updatedAt ?? now, opts.deletedAt ?? null)
}

type ExactTaskOpts = {createdAt: string; updatedAt: string; deletedAt?: string | null}

/**
 * Unlike `insertTask`, leaves nothing to call-time — `created_at` is explicit too — so a row built
 * on one side with the same arguments as a row built on the other is byte-for-byte identical, not
 * merely equal in the fields the caller happened to think to compare.
 */
function insertExactTask(db: Database.Database, id: string, content: string, opts: ExactTaskOpts): void {
  db.prepare(
    `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
     VALUES (?, 'active', ?, 0, 0, '2026-03-25', '', 'UTC', 0, 0, 'main', ?, ?, ?)`,
  ).run(id, content, opts.createdAt, opts.updatedAt, opts.deletedAt ?? null)
}

function insertTag(db: Database.Database, id: string, name: string, deletedAt: string | null = null): void {
  const now = new Date().toISOString()
  db.prepare("INSERT INTO tags (id, name, color, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    name,
    "#ff0000",
    now,
    now,
    deletedAt,
  )
}

function insertBranch(db: Database.Database, id: string, name: string, deletedAt: string | null = null): void {
  const now = new Date().toISOString()
  db.prepare("INSERT OR REPLACE INTO branches (id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    name,
    now,
    now,
    deletedAt,
  )
}

function getTaskRow(db: Database.Database, id: string): {content: string; deleted_at: string | null} | undefined {
  return db.prepare("SELECT content, deleted_at FROM tasks WHERE id = ?").get(id) as {content: string; deleted_at: string | null} | undefined
}

function makeAppPaths(assetsDir: string, icloudSyncDir: string, root: string): AppPaths {
  return {
    appDataRoot: () => root,
    dbPath: () => join(root, "db"),
    assetsDir: () => assetsDir,
    remoteSyncPath: () => icloudSyncDir,
    mutationSignalPath: () => join(root, ".s"),
  }
}

/** Wires `ProviderMigrationService` exactly the way `StorageController` will compose it in phase 2. */
function makeRig(db: Database.Database, root: string) {
  const assetsDir = join(root, "assets")
  const icloudSyncDir = join(root, "icloud")
  const core: StorageCore = createStorageCore(db, makeAppPaths(assetsDir, icloudSyncDir, root))

  const engine = new SyncEngine(core.localAdapter, [], {
    assetsDir: () => assetsDir,
    onStatusChange: () => {},
    onDataChanged: () => {},
  })

  const probe = {running: false}
  const buildRemotes = (sync: SyncSettings) => buildSyncRemotes(sync, {icloudSyncDir})

  async function applyRemoteConfiguration(): Promise<void> {
    const settings = await core.settingsService.loadSettings()
    engine.setRemotes(buildRemotes(settings.sync))
    if (resolveActiveProvider(settings.sync) !== "off") engine.enableAutoSync()
    else engine.disableAutoSync()
    probe.running = resolveActiveProvider(settings.sync) === "server"
  }

  async function saveSettings(partial: Partial<Settings>): Promise<void> {
    await core.settingsService.saveSettings(partial)
    if (partial.sync) await applyRemoteConfiguration()
  }

  const migration = new ProviderMigrationService({
    loadSettings: () => core.settingsService.loadSettings(),
    saveSettings,
    loadLocalDocs: () => core.localAdapter.loadAllDocs(),
    buildRemotes,
    setRemotes: (remotes) => engine.setRemotes(remotes),
    getRemoteStates: () => engine.getRemoteStates(),
    disableAutoSync: () => engine.disableAutoSync(),
    syncOnce: (strategy) => engine.syncOnce(strategy),
    applyRemoteConfiguration,
    stopProbe: () => {
      probe.running = false
    },
  } as never)

  return {
    core,
    engine,
    probe,
    migration,
    applyRemoteConfiguration,
    saveSettings,
    icloudSyncDir,
    assetsDir,
    loadSettings: () => core.settingsService.loadSettings(),
  }
}

async function pushIcloudSnapshot(icloudSyncDir: string, seed: (db: Database.Database) => void): Promise<void> {
  const db = createTestDatabase()
  try {
    seed(db)
    const engine = new SyncEngine(new LocalStorageAdapter(db), [{id: "icloud", label: "iCloud", adapter: new ICloudRemoteAdapter(icloudSyncDir)}], {
      assetsDir: () => "/tmp/daily-provider-migration-unused-assets",
      onStatusChange: () => {},
      onDataChanged: () => {},
    })
    await engine.syncOnce("push")
  } finally {
    db.close()
  }
}

async function pushServerSnapshot(binding: ServerSyncBinding, seed: (db: Database.Database) => void): Promise<void> {
  const db = createTestDatabase()
  try {
    seed(db)
    const engine = new SyncEngine(
      new LocalStorageAdapter(db),
      [{id: "daily-server", label: "Self-hosted Daily", adapter: new DailyServerRemoteAdapter(binding)}],
      {
        assetsDir: () => "/tmp/daily-provider-migration-unused-assets",
        onStatusChange: () => {},
        onDataChanged: () => {},
      },
    )
    await engine.syncOnce("push")
  } finally {
    db.close()
  }
}

async function readIcloudTaskIds(icloudSyncDir: string): Promise<string[]> {
  const snapshot = await new ICloudRemoteAdapter(icloudSyncDir).loadSnapshot()
  return (snapshot?.docs.tasks ?? []).map((t) => t.id).sort()
}

async function readServerDocs(binding: ServerSyncBinding) {
  const snapshot = await new DailyServerRemoteAdapter(binding).loadSnapshot()
  return snapshot?.docs ?? null
}

function makeBinding(server: BootedSyncServer, credential: IssuedCredential, overrides: Partial<ServerSyncBinding> = {}): ServerSyncBinding {
  return {
    baseUrl: server.baseUrl,
    serverId: "srv-1",
    serverName: "Test Daily Server",
    deviceId: credential.device.id,
    deviceName: credential.device.name,
    token: credential.token,
    fingerprint: null,
    insecure: true,
    boundAt: new Date().toISOString(),
    ...overrides,
  }
}

function baseSync(overrides: Partial<SyncSettings> = {}): SyncSettings {
  return {...getDefaultSettings().sync, ...overrides}
}

const tempRoots: string[] = []

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "daily-provider-migration-"))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})))
})

describe("previewing a migration writes nothing to either side", () => {
  it("previews_TC-3_live_counts_and_the_id-set_differences_against_a_server_target_and_an_iCloud_target_alike", async () => {
    const root = await makeTempRoot()
    const db = createTestDatabase()
    const server = await bootSyncServer()

    try {
      const rig = makeRig(db, root)

      insertTask(db, "shared-task", "local version")
      insertTask(db, "local-only-task", "only here")
      insertTask(db, "local-deleted-task", "gone locally", {deletedAt: hoursAgo(1)})
      insertTag(db, "shared-tag", "work")
      insertTag(db, "local-only-tag", "personal")
      insertBranch(db, "local-only-branch", "Local feature")

      const seedTarget = (targetDb: Database.Database) => {
        insertTask(targetDb, "shared-task", "remote version")
        insertTask(targetDb, "remote-only-task", "only there")
        insertTask(targetDb, "remote-deleted-task", "gone remotely", {deletedAt: hoursAgo(1)})
        insertTag(targetDb, "shared-tag", "work")
        insertTag(targetDb, "remote-only-tag", "urgent")
        insertBranch(targetDb, "remote-only-branch", "Remote feature")
      }

      const credential = await claimFirstDevice(server, "Primary Mac")
      const binding = makeBinding(server, credential)
      await rig.saveSettings({sync: baseSync({iCloud: {enabled: false}, server: {enabled: false, binding}})})

      await pushIcloudSnapshot(rig.icloudSyncDir, seedTarget)
      await pushServerSnapshot(binding, seedTarget)

      const expectedCounts = {tasks: 2, tags: 2, branches: 2}
      const expectedOnlyOne = {tasks: 1, tags: 1, branches: 1}
      const expectedConflicts = {tasks: 0, tags: 0, branches: 0}

      const icloudPreview = await rig.migration.preview("icloud")
      expect(icloudPreview.targetName).toBe("iCloud")
      expect(icloudPreview.targetHasSnapshot).toBe(true)
      expect(icloudPreview.local).toEqual(expectedCounts)
      expect(icloudPreview.remote).toEqual(expectedCounts)
      expect(icloudPreview.onlyOnLocal).toEqual(expectedOnlyOne)
      expect(icloudPreview.onlyOnRemote).toEqual(expectedOnlyOne)
      expect(icloudPreview.conflicts).toEqual(expectedConflicts)

      const serverPreview = await rig.migration.preview("server")
      expect(serverPreview.targetName).toBe("Test Daily Server")
      expect(serverPreview.targetHasSnapshot).toBe(true)
      expect(serverPreview.local).toEqual(expectedCounts)
      expect(serverPreview.remote).toEqual(expectedCounts)
      expect(serverPreview.onlyOnLocal).toEqual(expectedOnlyOne)
      expect(serverPreview.onlyOnRemote).toEqual(expectedOnlyOne)
      expect(serverPreview.conflicts).toEqual(expectedConflicts)

      const localTaskIds = (db.prepare("SELECT id FROM tasks ORDER BY id").all() as {id: string}[]).map((r) => r.id)
      expect(localTaskIds.sort()).toEqual(["local-deleted-task", "local-only-task", "shared-task"])

      expect(await readIcloudTaskIds(rig.icloudSyncDir)).toEqual(["remote-deleted-task", "remote-only-task", "shared-task"])
      const serverDocsAfter = await readServerDocs(binding)
      expect((serverDocsAfter?.tasks ?? []).map((t) => t.id).sort()).toEqual(["remote-deleted-task", "remote-only-task", "shared-task"])
    } finally {
      db.close()
      await server.close()
    }
  }, 30000)
})

describe("previewing an empty target", () => {
  it("previews_TC-4_a_freshly_claimed_server_with_no_snapshot_as_zeroed_with_onlyOnLocal_equal_to_local", async () => {
    const root = await makeTempRoot()
    const db = createTestDatabase()
    const server = await bootSyncServer()

    try {
      const rig = makeRig(db, root)

      insertTask(db, "t1", "One")
      insertTask(db, "t2", "Two")
      insertTag(db, "g1", "work")

      const credential = await claimFirstDevice(server, "Primary Mac")
      const binding = makeBinding(server, credential)
      await rig.saveSettings({sync: baseSync({iCloud: {enabled: false}, server: {enabled: false, binding}})})

      const preview = await rig.migration.preview("server")

      expect(preview.targetHasSnapshot).toBe(false)
      expect(preview.remote).toEqual({tasks: 0, tags: 0, branches: 0})
      expect(preview.onlyOnLocal).toEqual(preview.local)
      expect(preview.conflicts).toEqual({tasks: 0, tags: 0, branches: 0})
      expect(preview.local.tasks).toBe(2)
      expect(preview.local.tags).toBe(1)
    } finally {
      db.close()
      await server.close()
    }
  }, 30000)
})

describe("the preview counts genuine conflicts", () => {
  /**
   * Four tasks, live on both sides with matching `updated_at`, of which only two are the conflict
   * the direction question exists to decide: `conflict-1`/`conflict-2` tie and differ.
   * `identical-tie` also ties but the two copies are byte-identical, so no direction changes what
   * survives it. `target-newer` was edited more recently on the target, so `updated_at` already
   * decides it without consulting a direction at all.
   */
  async function setupConflictPreview() {
    const root = await makeTempRoot()
    const db = createTestDatabase()
    const server = await bootSyncServer()
    const rig = makeRig(db, root)

    const createdAt = hoursAgo(10)
    const conflictAt1 = hoursAgo(3)
    const conflictAt2 = hoursAgo(2)
    const tieAt = hoursAgo(4)
    const staleLocalAt = hoursAgo(5)
    const freshTargetAt = hoursAgo(1)

    insertExactTask(db, "conflict-1", "Local edit one", {createdAt, updatedAt: conflictAt1})
    insertExactTask(db, "conflict-2", "Local edit two", {createdAt, updatedAt: conflictAt2})
    insertExactTask(db, "identical-tie", "Same on both sides", {createdAt, updatedAt: tieAt})
    insertExactTask(db, "target-newer", "Stale local text", {createdAt, updatedAt: staleLocalAt})

    const credential = await claimFirstDevice(server, "Primary Mac")
    const binding = makeBinding(server, credential)
    await rig.saveSettings({sync: baseSync({iCloud: {enabled: false}, server: {enabled: false, binding}})})

    await pushServerSnapshot(binding, (targetDb) => {
      insertExactTask(targetDb, "conflict-1", "Server edit one", {createdAt, updatedAt: conflictAt1})
      insertExactTask(targetDb, "conflict-2", "Server edit two", {createdAt, updatedAt: conflictAt2})
      insertExactTask(targetDb, "identical-tie", "Same on both sides", {createdAt, updatedAt: tieAt})
      insertExactTask(targetDb, "target-newer", "Fresh target text", {createdAt, updatedAt: freshTargetAt})
    })

    return {db, server, rig}
  }

  it("counts_TC-16_exactly_the_genuine_ties_and_zero_against_a_target_with_no_snapshot", async () => {
    const {db, server, rig} = await setupConflictPreview()
    try {
      const preview = await rig.migration.preview("server")
      expect(preview.conflicts).toEqual({tasks: 2, tags: 0, branches: 0})
    } finally {
      db.close()
      await server.close()
    }

    const emptyRoot = await makeTempRoot()
    const emptyDb = createTestDatabase()
    const emptyServer = await bootSyncServer()
    try {
      const emptyRig = makeRig(emptyDb, emptyRoot)
      insertTask(emptyDb, "t1", "One")
      insertTag(emptyDb, "g1", "work")
      insertBranch(emptyDb, "b1", "Feature")

      const credential = await claimFirstDevice(emptyServer, "Primary Mac")
      const binding = makeBinding(emptyServer, credential)
      await emptyRig.saveSettings({sync: baseSync({iCloud: {enabled: false}, server: {enabled: false, binding}})})

      const preview = await emptyRig.migration.preview("server")
      expect(preview.targetHasSnapshot).toBe(false)
      expect(preview.conflicts).toEqual({tasks: 0, tags: 0, branches: 0})
    } finally {
      emptyDb.close()
      await emptyServer.close()
    }
  }, 30000)
})

describe("migrating in each direction", () => {
  async function setupContestedMigration() {
    const root = await makeTempRoot()
    const db = createTestDatabase()
    const server = await bootSyncServer()
    const rig = makeRig(db, root)

    const contestedAt = hoursAgo(2)
    insertTask(db, "contested", "Local content", {updatedAt: contestedAt})
    insertTask(db, "local-only-task", "Local exclusive")

    const credential = await claimFirstDevice(server, "Primary Mac")
    const binding = makeBinding(server, credential)

    await pushServerSnapshot(binding, (targetDb) => {
      insertTask(targetDb, "contested", "Server content", {updatedAt: contestedAt})
      insertTask(targetDb, "server-only-task", "Server exclusive")
    })

    await rig.saveSettings({sync: baseSync({iCloud: {enabled: true}, server: {enabled: false, binding}})})
    await rig.applyRemoteConfiguration()

    return {root, db, server, rig, binding}
  }

  it("migrates_TC-5_keep-local_uniting_both_sides_while_the_contested_task_holds_this_Macs_content_everywhere", async () => {
    const {db, server, rig, binding} = await setupContestedMigration()

    try {
      await rig.migration.migrate("server", "keep-local")

      expect(getTaskRow(db, "contested")?.content).toBe("Local content")
      expect(getTaskRow(db, "local-only-task")).toBeDefined()
      expect(getTaskRow(db, "server-only-task")).toBeDefined()

      const serverDocs = await readServerDocs(binding)
      const byId = new Map((serverDocs?.tasks ?? []).map((t) => [t.id, t]))
      expect(byId.get("contested")?.content).toBe("Local content")
      expect(byId.has("local-only-task")).toBe(true)
      expect(byId.has("server-only-task")).toBe(true)

      const settings = await rig.loadSettings()
      expect(settings.sync.iCloud.enabled).toBe(false)
      expect(settings.sync.server.enabled).toBe(true)
      expect(rig.probe.running).toBe(true)
      expect(rig.engine.syncStatus).toBe("active")
    } finally {
      db.close()
      await server.close()
    }
  }, 30000)

  it("migrates_TC-6_keep-target_uniting_both_sides_while_the_contested_task_holds_the_servers_content_everywhere", async () => {
    const {db, server, rig, binding} = await setupContestedMigration()

    try {
      await rig.migration.migrate("server", "keep-target")

      expect(getTaskRow(db, "contested")?.content).toBe("Server content")
      expect(getTaskRow(db, "local-only-task")).toBeDefined()
      expect(getTaskRow(db, "server-only-task")).toBeDefined()

      const serverDocs = await readServerDocs(binding)
      const byId = new Map((serverDocs?.tasks ?? []).map((t) => [t.id, t]))
      expect(byId.get("contested")?.content).toBe("Server content")
      expect(byId.has("local-only-task")).toBe(true)
      expect(byId.has("server-only-task")).toBe(true)
    } finally {
      db.close()
      await server.close()
    }
  }, 30000)
})

describe("a migration that fails rolls back", () => {
  it("rolls_back_TC-7_leaving_iCloud_active_and_syncing_with_the_reason_in_MIGRATION_FAILEDs_message", async () => {
    const root = await makeTempRoot()
    const db = createTestDatabase()
    const server = await bootSyncServer()

    const rig = makeRig(db, root)
    const credential = await claimFirstDevice(server, "Primary Mac")
    const binding = makeBinding(server, credential)

    await rig.saveSettings({sync: baseSync({iCloud: {enabled: true}, server: {enabled: false, binding}})})
    await rig.applyRemoteConfiguration()
    expect(rig.engine.syncStatus).toBe("active")

    await server.close()

    try {
      const failure = await rig.migration.migrate("server", "keep-local").then(
        () => null,
        (error: unknown) => error,
      )

      expect(failure).toBeInstanceOf(SyncServerError)
      expect((failure as SyncServerError).code).toBe(SyncServerErrorCode.MIGRATION_FAILED)
      expect((failure as SyncServerError).message).toContain("Could not reach the server")

      const settings = await rig.loadSettings()
      expect(settings.sync.iCloud.enabled).toBe(true)
      expect(settings.sync.server.enabled).toBe(false)

      const states = rig.engine.getRemoteStates()
      expect(states.map((s) => s.id)).toEqual(["icloud"])

      expect(rig.engine.syncStatus).toBe("active")
    } finally {
      db.close()
    }
  }, 30000)
})

describe("turning syncing off and back on", () => {
  it("stops_TC-8_syncing_while_keeping_the_server_credential_byte-for-byte", async () => {
    const root = await makeTempRoot()
    const db = createTestDatabase()
    const server = await bootSyncServer()

    try {
      const rig = makeRig(db, root)
      const credential = await claimFirstDevice(server, "Primary Mac")
      const binding = makeBinding(server, credential)

      insertTask(db, "t1", "Keep me")
      insertTag(db, "g1", "work")
      insertBranch(db, "b1", "Feature")

      await rig.saveSettings({sync: baseSync({iCloud: {enabled: false}, server: {enabled: true, binding}})})
      await rig.applyRemoteConfiguration()
      expect(rig.engine.syncStatus).toBe("active")
      expect(rig.probe.running).toBe(true)

      const tasksBefore = db.prepare("SELECT * FROM tasks ORDER BY id").all()
      const tagsBefore = db.prepare("SELECT * FROM tags ORDER BY id").all()
      const branchesBefore = db.prepare("SELECT * FROM branches ORDER BY id").all()

      await rig.migration.migrate("off", null)

      const settings = await rig.loadSettings()
      expect(settings.sync.iCloud.enabled).toBe(false)
      expect(settings.sync.server.enabled).toBe(false)
      expect(settings.sync.server.binding).toEqual(binding)

      expect(resolveActiveProvider(settings.sync)).toBe("off")
      expect(buildSyncRemotes(settings.sync, {icloudSyncDir: rig.icloudSyncDir})).toHaveLength(0)

      expect(rig.engine.syncStatus).toBe("inactive")
      expect(rig.probe.running).toBe(false)

      expect(db.prepare("SELECT * FROM tasks ORDER BY id").all()).toEqual(tasksBefore)
      expect(db.prepare("SELECT * FROM tags ORDER BY id").all()).toEqual(tagsBefore)
      expect(db.prepare("SELECT * FROM branches ORDER BY id").all()).toEqual(branchesBefore)
    } finally {
      db.close()
      await server.close()
    }
  }, 30000)

  it("resumes_TC-9_the_stored_credential_with_no_probe_claim_or_enrollment_call", async () => {
    const root = await makeTempRoot()
    const db = createTestDatabase()
    const server = await bootSyncServer()

    try {
      const rig = makeRig(db, root)
      const credential = await claimFirstDevice(server, "Primary Mac")
      const binding = makeBinding(server, credential)

      await pushServerSnapshot(binding, (targetDb) => insertTask(targetDb, "already-there", "From before off"))

      // The state TC-8 leaves behind: bound, not enabled, iCloud off.
      await rig.saveSettings({sync: baseSync({iCloud: {enabled: false}, server: {enabled: false, binding}})})
      await rig.applyRemoteConfiguration()

      /**
       * `ProviderMigrationService` never holds a `ServerProviderService` (it is not part of its
       * frozen dependency shape) — spying on the class itself is the direct way to prove this
       * migration reaches the server only through `SyncEngine`, never through the wizard's API.
       */
      const probeSpy = vi.spyOn(ServerProviderService.prototype, "probe")
      const claimSpy = vi.spyOn(ServerProviderService.prototype, "claim")
      const requestEnrollmentSpy = vi.spyOn(ServerProviderService.prototype, "requestEnrollment")
      const pollEnrollmentSpy = vi.spyOn(ServerProviderService.prototype, "pollEnrollment")

      await rig.migration.migrate("server", "keep-local")

      expect(probeSpy).not.toHaveBeenCalled()
      expect(claimSpy).not.toHaveBeenCalled()
      expect(requestEnrollmentSpy).not.toHaveBeenCalled()
      expect(pollEnrollmentSpy).not.toHaveBeenCalled()

      const settings = await rig.loadSettings()
      expect(resolveActiveProvider(settings.sync)).toBe("server")
      expect(settings.sync.server.binding?.token).toBe(binding.token)
      expect(getTaskRow(db, "already-there")).toBeDefined()

      probeSpy.mockRestore()
      claimSpy.mockRestore()
      requestEnrollmentSpy.mockRestore()
      pollEnrollmentSpy.mockRestore()
    } finally {
      db.close()
      await server.close()
    }
  }, 30000)
})

describe("a tie between a delete and an edit", () => {
  async function setupTieMigration() {
    const root = await makeTempRoot()
    const db = createTestDatabase()
    const server = await bootSyncServer()
    const rig = makeRig(db, root)

    const tieA = hoursAgo(3)
    const tieB = hoursAgo(2)

    insertTask(db, "deleted-locally", "Local before delete", {updatedAt: tieA, deletedAt: tieA})
    insertTask(db, "edited-locally", "Local edit", {updatedAt: tieB})
    insertTask(db, "local-only-task", "Local exclusive")

    const credential = await claimFirstDevice(server, "Primary Mac")
    const binding = makeBinding(server, credential)

    await pushServerSnapshot(binding, (targetDb) => {
      insertTask(targetDb, "deleted-locally", "Server edit", {updatedAt: tieA})
      insertTask(targetDb, "edited-locally", "Server before delete", {updatedAt: tieB, deletedAt: tieB})
      insertTask(targetDb, "server-only-task", "Server exclusive")
    })

    await rig.saveSettings({sync: baseSync({iCloud: {enabled: false}, server: {enabled: false, binding}})})

    return {db, server, rig, binding}
  }

  it("resolves_TC-15_each_tied_pair_by_direction_while_neither_sides_unique_task_vanishes", async () => {
    const keepLocal = await setupTieMigration()
    try {
      await keepLocal.rig.migration.migrate("server", "keep-local")

      const deletedLocally = getTaskRow(keepLocal.db, "deleted-locally")
      expect(deletedLocally?.deleted_at).not.toBeNull()

      const editedLocally = getTaskRow(keepLocal.db, "edited-locally")
      expect(editedLocally?.deleted_at).toBeNull()
      expect(editedLocally?.content).toBe("Local edit")

      expect(getTaskRow(keepLocal.db, "local-only-task")?.deleted_at).toBeNull()
      expect(getTaskRow(keepLocal.db, "server-only-task")?.deleted_at).toBeNull()

      const serverDocs = await readServerDocs(keepLocal.binding)
      const byId = new Map((serverDocs?.tasks ?? []).map((t) => [t.id, t]))
      expect(byId.get("deleted-locally")?.deleted_at).not.toBeNull()
      expect(byId.get("edited-locally")?.deleted_at).toBeNull()
      expect(byId.get("edited-locally")?.content).toBe("Local edit")
      expect(byId.has("local-only-task")).toBe(true)
      expect(byId.has("server-only-task")).toBe(true)
    } finally {
      keepLocal.db.close()
      await keepLocal.server.close()
    }

    const keepTarget = await setupTieMigration()
    try {
      await keepTarget.rig.migration.migrate("server", "keep-target")

      const deletedLocally = getTaskRow(keepTarget.db, "deleted-locally")
      expect(deletedLocally?.deleted_at).toBeNull()
      expect(deletedLocally?.content).toBe("Server edit")

      const editedLocally = getTaskRow(keepTarget.db, "edited-locally")
      expect(editedLocally?.deleted_at).not.toBeNull()

      expect(getTaskRow(keepTarget.db, "local-only-task")?.deleted_at).toBeNull()
      expect(getTaskRow(keepTarget.db, "server-only-task")?.deleted_at).toBeNull()

      const serverDocs = await readServerDocs(keepTarget.binding)
      const byId = new Map((serverDocs?.tasks ?? []).map((t) => [t.id, t]))
      expect(byId.get("deleted-locally")?.deleted_at).toBeNull()
      expect(byId.get("deleted-locally")?.content).toBe("Server edit")
      expect(byId.get("edited-locally")?.deleted_at).not.toBeNull()
      expect(byId.has("local-only-task")).toBe(true)
      expect(byId.has("server-only-task")).toBe(true)
    } finally {
      keepTarget.db.close()
      await keepTarget.server.close()
    }
  }, 60000)

  it("counts_TC-17_a_tied_delete-vs-edit_as_a_conflict_on_both_sides_while_the_display_counts_stay_live-only", async () => {
    const {db, server, rig} = await setupTieMigration()
    try {
      const preview = await rig.migration.preview("server")

      expect(preview.conflicts).toEqual({tasks: 2, tags: 0, branches: 0})

      expect(preview.local).toEqual({tasks: 2, tags: 0, branches: 1})
      expect(preview.remote).toEqual({tasks: 2, tags: 0, branches: 1})
      expect(preview.onlyOnLocal).toEqual({tasks: 2, tags: 0, branches: 0})
      expect(preview.onlyOnRemote).toEqual({tasks: 2, tags: 0, branches: 0})
    } finally {
      db.close()
      await server.close()
    }
  }, 30000)
})
