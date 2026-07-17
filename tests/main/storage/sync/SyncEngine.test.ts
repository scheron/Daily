import {beforeEach, describe, expect, it, vi} from "vitest"

import {SyncEngine} from "@main/storage/sync/SyncEngine"
import {buildSnapshot} from "@main/utils/sync/snapshot/buildSnapshot"

import type {ILocalStorage, IRemoteStorage, Snapshot, SnapshotDocs, SnapshotFile, SnapshotTask} from "@main/types/sync"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {SYNC_ENGINE: "SYNC_ENGINE", SYNC_PULL: "SYNC_PULL", SYNC_PUSH: "SYNC_PUSH", SYNC_REMOTE: "SYNC_REMOTE"},
  },
}))

function emptyDocs(): SnapshotDocs {
  return {tasks: [], tags: [], branches: [], files: [], events: [], settings: null}
}

function makeTask(id: string, updatedAt: string): SnapshotTask {
  return {
    id,
    status: "active",
    content: `task ${id}`,
    minimized: false,
    order_index: 0,
    scheduled_date: "2026-07-18",
    scheduled_time: "10:00:00",
    scheduled_timezone: "UTC",
    estimated_time: 0,
    spent_time: 0,
    branch_id: "main",
    tags: [],
    attachments: [],
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
  }
}

class FakeLocalStore implements ILocalStorage {
  docs = emptyDocs()

  async loadAllDocs(): Promise<SnapshotDocs> {
    return structuredClone(this.docs)
  }

  async upsertDocs(incoming: SnapshotDocs): Promise<void> {
    for (const key of ["tasks", "tags", "branches", "files", "events"] as const) {
      const byId = new Map(this.docs[key].map((d: {id: string}) => [d.id, d]))
      for (const doc of incoming[key]) byId.set(doc.id, doc as never)
      this.docs[key] = [...byId.values()] as never
    }
    if (incoming.settings) this.docs.settings = incoming.settings
  }

  async deleteDocs(ids: {tasks?: string[]; tags?: string[]; branches?: string[]; files?: string[]}): Promise<void> {
    if (ids.tasks) this.docs.tasks = this.docs.tasks.filter((t) => !ids.tasks!.includes(t.id))
    if (ids.tags) this.docs.tags = this.docs.tags.filter((t) => !ids.tags!.includes(t.id))
    if (ids.branches) this.docs.branches = this.docs.branches.filter((b) => !ids.branches!.includes(b.id))
    if (ids.files) this.docs.files = this.docs.files.filter((f) => !ids.files!.includes(f.id))
  }
}

class FakeRemote implements IRemoteStorage {
  snapshot: Snapshot | null = null
  failLoad = false
  saveCount = 0

  async loadSnapshot(): Promise<Snapshot | null> {
    if (this.failLoad) throw new Error("unreachable")
    return this.snapshot ? structuredClone(this.snapshot) : null
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    this.saveCount++
    this.snapshot = structuredClone(snapshot)
  }

  async syncAssets(_localAssetsDir: string, _fileManifest: SnapshotFile[]): Promise<void> {}
}

function makeEngine(local: FakeLocalStore, remotes: Array<{id: string; adapter: IRemoteStorage}>) {
  const onDataChanged = vi.fn()
  const engine = new SyncEngine(
    local,
    remotes.map((r) => ({id: r.id, label: r.id, adapter: r.adapter})),
    {assetsDir: () => "/tmp/unused-assets", onStatusChange: vi.fn(), onDataChanged},
  )
  return {engine, onDataChanged}
}

describe("SyncEngine (multi-remote)", () => {
  let local: FakeLocalStore

  beforeEach(() => {
    local = new FakeLocalStore()
  })

  it("syncOnce works without enableAutoSync: pushes local data to an empty remote", async () => {
    local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
    const remote = new FakeRemote()
    const {engine} = makeEngine(local, [{id: "a", adapter: remote}])

    await engine.syncOnce("pull")

    expect(remote.snapshot?.docs.tasks.map((t) => t.id)).toEqual(["t1"])
  })

  it("bridges remotes: a doc pulled from remote A is pushed to remote B", async () => {
    const a = new FakeRemote()
    const b = new FakeRemote()
    a.snapshot = buildSnapshot({...emptyDocs(), tasks: [makeTask("tA", "2026-07-18T10:00:00.000Z")]})
    const {engine, onDataChanged} = makeEngine(local, [
      {id: "a", adapter: a},
      {id: "b", adapter: b},
    ])

    await engine.syncOnce("pull")

    expect(local.docs.tasks.map((t) => t.id)).toEqual(["tA"])
    expect(b.snapshot?.docs.tasks.map((t) => t.id)).toEqual(["tA"])
    expect(onDataChanged).toHaveBeenCalled()
  })

  it("isolates a failing remote: the healthy one still syncs, the failure lands in remote state", async () => {
    local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
    const dead = new FakeRemote()
    dead.failLoad = true
    const alive = new FakeRemote()
    const {engine} = makeEngine(local, [
      {id: "dead", adapter: dead},
      {id: "alive", adapter: alive},
    ])

    await expect(engine.syncOnce("pull")).resolves.toBeUndefined()

    expect(alive.snapshot?.docs.tasks.map((t) => t.id)).toEqual(["t1"])
    const states = engine.getRemoteStates()
    expect(states.find((s) => s.id === "dead")?.lastError).toContain("unreachable")
    expect(states.find((s) => s.id === "alive")?.lastError).toBeNull()
    expect(states.find((s) => s.id === "alive")?.lastSyncAt).not.toBeNull()
  })

  it("rejects when every remote fails", async () => {
    const dead = new FakeRemote()
    dead.failLoad = true
    const {engine} = makeEngine(local, [{id: "dead", adapter: dead}])

    await expect(engine.syncOnce("pull")).rejects.toThrow("unreachable")
  })

  it("does not push when the remote already matches", async () => {
    const task = makeTask("t1", "2026-07-18T10:00:00.000Z")
    local.docs.tasks = [task]
    const remote = new FakeRemote()
    remote.snapshot = buildSnapshot({...emptyDocs(), tasks: [task]})
    const {engine} = makeEngine(local, [{id: "a", adapter: remote}])

    await engine.syncOnce("pull")

    expect(remote.saveCount).toBe(0)
  })

  it("setRemotes preserves state for surviving ids and drops removed ones", async () => {
    const a = new FakeRemote()
    const {engine} = makeEngine(local, [{id: "a", adapter: a}])
    local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
    await engine.syncOnce("pull")
    const before = engine.getRemoteStates().find((s) => s.id === "a")

    engine.setRemotes([
      {id: "a", label: "a", adapter: a},
      {id: "b", label: "b", adapter: new FakeRemote()},
    ])

    const states = engine.getRemoteStates()
    expect(states.map((s) => s.id)).toEqual(["a", "b"])
    expect(states.find((s) => s.id === "a")?.lastSyncAt).toBe(before?.lastSyncAt)
    expect(states.find((s) => s.id === "b")?.lastSyncAt).toBeNull()
  })
})
