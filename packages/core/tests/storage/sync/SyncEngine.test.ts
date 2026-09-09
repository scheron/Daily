import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {RemoteWriteConflictError, SYNC_CONFIG, SYNC_REMOTE_ID} from "@daily/protocol"

import {SyncEngine} from "@core/storage/sync/SyncEngine"
import {buildSnapshot} from "@core/utils/sync/snapshot/buildSnapshot"

import type {
  ILocalStorage,
  IRemoteStorage,
  IRevisionedRemoteStorage,
  RemoteReadResult,
  Snapshot,
  SnapshotDocs,
  SnapshotFile,
  SnapshotRevision,
  SnapshotTask,
} from "@daily/protocol"

vi.mock("../../../src/utils/logger", () => ({
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
  loadCount = 0

  async loadSnapshot(): Promise<Snapshot | null> {
    this.loadCount++
    if (this.failLoad) throw new Error("unreachable")
    return this.snapshot ? structuredClone(this.snapshot) : null
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    this.saveCount++
    this.snapshot = structuredClone(snapshot)
  }

  async syncAssets(_localAssetsDir: string, _fileManifest: SnapshotFile[]): Promise<void> {}
}

/**
 * A remote that declares revision support. `loadSnapshotWithRevision` and
 * `saveSnapshotIfUnchanged` are the only methods a conforming caller should
 * ever use against it; `loadSnapshot` / `saveSnapshot` are implemented only
 * to satisfy `IRemoteStorage`, unconditionally and without regard to
 * revisions, so that a caller which still goes through the plain path (the
 * pre-retry-loop behaviour) observably loses another device's concurrent
 * write instead of merging it — which is the bug this fake exists to catch.
 *
 * `advanceAfterNextRead` simulates another device winning a race: the next
 * call to `loadSnapshotWithRevision` returns the state that was current at
 * the time of the read, then immediately moves the remote's own state
 * forward, so that a write attempted against the revision just read is
 * rejected, and only a fresh re-read observes the advance.
 */
class FakeRevisionedRemote implements IRevisionedRemoteStorage {
  readonly supportsRevisions = true as const
  revision: SnapshotRevision | null
  snapshot: Snapshot | null
  acceptedSnapshot: Snapshot | null = null
  rejectAllWrites = false
  loadWithRevisionCount = 0
  saveAttempts = 0
  rejectedWrites = 0
  private pendingAdvance: {revision: SnapshotRevision; snapshot: Snapshot} | null = null

  constructor(initial: {revision: SnapshotRevision | null; snapshot: Snapshot | null}) {
    this.revision = initial.revision
    this.snapshot = initial.snapshot
  }

  advanceAfterNextRead(next: {revision: SnapshotRevision; snapshot: Snapshot}): void {
    this.pendingAdvance = next
  }

  async loadSnapshot(): Promise<Snapshot | null> {
    return this.snapshot ? structuredClone(this.snapshot) : null
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot)
    this.acceptedSnapshot = structuredClone(snapshot)
  }

  async syncAssets(_localAssetsDir: string, _fileManifest: SnapshotFile[]): Promise<void> {}

  async loadSnapshotWithRevision(): Promise<RemoteReadResult> {
    this.loadWithRevisionCount++
    const result: RemoteReadResult = {
      snapshot: this.snapshot ? structuredClone(this.snapshot) : null,
      revision: this.revision,
    }
    if (this.pendingAdvance) {
      this.revision = this.pendingAdvance.revision
      this.snapshot = this.pendingAdvance.snapshot
      this.pendingAdvance = null
    }
    return result
  }

  async saveSnapshotIfUnchanged(snapshot: Snapshot, expectedRevision: SnapshotRevision | null): Promise<SnapshotRevision> {
    this.saveAttempts++
    if (this.rejectAllWrites || expectedRevision !== this.revision) {
      this.rejectedWrites++
      throw new RemoteWriteConflictError()
    }
    this.snapshot = structuredClone(snapshot)
    this.acceptedSnapshot = structuredClone(snapshot)
    this.revision = `r${this.saveAttempts + 1}`
    return this.revision
  }
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

  it("reads_TC-7_and_writes_a_non_revisioned_remote_once_unconditionally_with_no_retry", async () => {
    local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
    const remote = new FakeRemote()
    const {engine} = makeEngine(local, [{id: "a", adapter: remote}])

    await engine.syncOnce("pull")

    expect(remote.loadCount).toBe(1)
    expect(remote.saveCount).toBe(1)
    expect(remote.snapshot?.docs.tasks.map((t) => t.id)).toEqual(["t1"])
  })

  it("retries_TC-5_a_lost_conditional_write_against_fresh_remote_state_and_lands_the_merge_locally", async () => {
    const taskA = makeTask("tA", "2026-07-18T10:00:00.000Z")
    const taskB = makeTask("tB", "2026-07-18T09:00:00.000Z")
    const taskC = makeTask("tC", "2026-07-18T09:30:00.000Z")
    local.docs.tasks = [taskA]

    const remote = new FakeRevisionedRemote({
      revision: "r1",
      snapshot: buildSnapshot({...emptyDocs(), tasks: [taskB]}),
    })
    remote.advanceAfterNextRead({
      revision: "r2",
      snapshot: buildSnapshot({...emptyDocs(), tasks: [taskB, taskC]}),
    })
    const {engine} = makeEngine(local, [{id: "a", adapter: remote}])

    await engine.syncOnce("pull")

    expect(remote.rejectedWrites).toBe(1)
    expect(remote.loadWithRevisionCount).toBe(2)
    expect(remote.acceptedSnapshot?.docs.tasks.map((t) => t.id).toSorted()).toEqual(["tA", "tB", "tC"])
    expect(local.docs.tasks.map((t) => t.id).toSorted()).toEqual(["tA", "tB", "tC"])
  })

  it("defers_TC-6_after_exhausting_conditional_write_attempts_without_failing_the_cycle", async () => {
    const taskA = makeTask("tA", "2026-07-18T10:00:00.000Z")
    local.docs.tasks = [taskA]

    const remote = new FakeRevisionedRemote({revision: null, snapshot: null})
    remote.rejectAllWrites = true
    const onStatusChange = vi.fn()
    const engine = new SyncEngine(local, [{id: "a", label: "a", adapter: remote}], {
      assetsDir: () => "/tmp/unused-assets",
      onStatusChange,
      onDataChanged: vi.fn(),
    })
    engine.enableAutoSync()

    await expect(engine.sync()).resolves.toBeUndefined()

    expect(remote.saveAttempts).toBe(SYNC_CONFIG.conditionalWriteMaxAttempts)
    expect(remote.loadWithRevisionCount).toBe(SYNC_CONFIG.conditionalWriteMaxAttempts)
    expect(remote.acceptedSnapshot).toBeNull()
    expect(engine.syncStatus).toBe("active")
    expect(engine.getRemoteStates().find((s) => s.id === "a")?.lastError).toBeTruthy()
    expect(local.docs.tasks.map((t) => t.id)).toEqual(["tA"])

    engine.disableAutoSync()
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

  describe("auto-sync lifecycle", () => {
    it("transitions inactive -> active -> inactive and is idempotent on double-enable", () => {
      const onStatusChange = vi.fn()
      const remote = new FakeRemote()
      const engine = new SyncEngine(local, [{id: "a", label: "a", adapter: remote}], {
        assetsDir: () => "/tmp/unused-assets",
        onStatusChange,
        onDataChanged: vi.fn(),
      })

      expect(engine.syncStatus).toBe("inactive")

      engine.enableAutoSync()
      expect(engine.syncStatus).toBe("active")
      expect(onStatusChange).toHaveBeenCalledWith("active", "inactive")

      const callCountAfterFirstEnable = onStatusChange.mock.calls.length
      engine.enableAutoSync()
      expect(onStatusChange.mock.calls.length).toBe(callCountAfterFirstEnable)

      engine.disableAutoSync()
      expect(engine.syncStatus).toBe("inactive")
      expect(onStatusChange).toHaveBeenCalledWith("inactive", "active")
    })
  })

  describe("sync()", () => {
    it("is a no-op when auto-sync is not enabled", async () => {
      const remote = new FakeRemote()
      local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
      const {engine} = makeEngine(local, [{id: "a", adapter: remote}])

      await engine.sync()

      expect(remote.saveCount).toBe(0)
    })

    it("swallows a total sync failure into the 'error' status instead of throwing", async () => {
      const onStatusChange = vi.fn()
      const dead = new FakeRemote()
      dead.failLoad = true
      const engine = new SyncEngine(local, [{id: "dead", label: "dead", adapter: dead}], {
        assetsDir: () => "/tmp/unused-assets",
        onStatusChange,
        onDataChanged: vi.fn(),
      })
      engine.enableAutoSync()
      onStatusChange.mockClear()

      await expect(engine.sync()).resolves.toBeUndefined()

      expect(engine.syncStatus).toBe("error")
      const statuses = onStatusChange.mock.calls.map((c) => c[0])
      expect(statuses).toContain("error")

      engine.disableAutoSync()
    })
  })

  describe("_normalizeSettings", () => {
    it("parses an old-format settings.data JSON string and spreads it before merging", async () => {
      const remote = new FakeRemote()
      const oldFormatDocs = {
        ...emptyDocs(),
        settings: {
          id: "settings",
          data: JSON.stringify({version: "1", themes: {current: "dark"}}),
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
        } as never,
      }
      remote.snapshot = buildSnapshot(oldFormatDocs)
      const {engine} = makeEngine(local, [{id: "a", adapter: remote}])

      await engine.syncOnce("pull")

      expect(local.docs.settings).not.toBeNull()
      expect((local.docs.settings as never as {data?: string}).data).toBeUndefined()
      expect((local.docs.settings as never as {version: string}).version).toBe("1")
      expect((local.docs.settings as never as {themes: {current: string}}).themes.current).toBe("dark")
      expect((local.docs.settings as never as {id: string}).id).toBe("settings")
    })
  })

  /**
   * `SyncEngine` gets a new debounced push-request method in phase 5 ("Changes": "a debounced
   * request-to-push"); the plan does not freeze its name — phase 5's own "Frozen for later phases"
   * is empty. `requestPush` is this suite's own name for it, taken directly from that phrase, cast
   * onto the real engine so these cases exercise real behaviour once it exists rather than a mock —
   * flagged in the test-writer's report as an assumption, not a decision the plan took.
   *
   * Until phase 5 adds it, the method does not exist at all, so every case below first asserts that
   * it does rather than crashing on a call to nothing: each is NOT-YET-RUNNABLE for that reason.
   */
  function requestsAPush(engine: SyncEngine): {requestPush: () => void} {
    const withPush = engine as unknown as Partial<{requestPush: () => void}>
    expect(typeof withPush.requestPush, "NOT-YET-RUNNABLE until phase 5 adds a debounced push-request method to SyncEngine").toBe("function")
    return withPush as {requestPush: () => void}
  }

  describe("the debounced push request — TC-17, TC-18, TC-19, TC-20", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("runs_TC-17_a_sync_two_seconds_after_the_last_request_without_waiting_for_the_periodic_timer", async () => {
      local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
      const remote = new FakeRemote()
      const {engine} = makeEngine(local, [{id: "a", adapter: remote}])
      engine.enableAutoSync()

      requestsAPush(engine).requestPush()

      await vi.advanceTimersByTimeAsync(1000)
      expect(remote.saveCount).toBe(0)

      await vi.advanceTimersByTimeAsync(1500)
      expect(remote.saveCount).toBe(1)

      engine.disableAutoSync()
    })

    it("pushes to the server on its own shorter debounce, before iCloud's would have fired", async () => {
      local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
      const server = new FakeRemote()
      const {engine} = makeEngine(local, [{id: SYNC_REMOTE_ID.server, adapter: server}])
      engine.enableAutoSync()

      requestsAPush(engine).requestPush()

      await vi.advanceTimersByTimeAsync(600)
      expect(server.saveCount, "the server pays nothing per write, so it does not wait iCloud's two seconds").toBe(1)

      engine.disableAutoSync()
    })

    it("leaves iCloud on its slower debounce, untouched by the server's", async () => {
      local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
      const icloud = new FakeRemote()
      const {engine} = makeEngine(local, [{id: SYNC_REMOTE_ID.icloud, adapter: icloud}])
      engine.enableAutoSync()

      requestsAPush(engine).requestPush()

      await vi.advanceTimersByTimeAsync(600)
      expect(icloud.saveCount, "iCloud must not start writing on the server's debounce").toBe(0)

      await vi.advanceTimersByTimeAsync(1500)
      expect(icloud.saveCount).toBe(1)

      engine.disableAutoSync()
    })

    it("runs_TC-18_exactly_one_sync_for_several_requests_made_in_quick_succession", async () => {
      local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
      const remote = new FakeRemote()
      const {engine} = makeEngine(local, [{id: "a", adapter: remote}])
      engine.enableAutoSync()
      const push = requestsAPush(engine)

      push.requestPush()
      await vi.advanceTimersByTimeAsync(800)
      push.requestPush()
      await vi.advanceTimersByTimeAsync(800)
      push.requestPush()

      await vi.advanceTimersByTimeAsync(2500)

      expect(remote.saveCount).toBe(1)

      engine.disableAutoSync()
    })

    it("schedules_TC-19_no_extra_push_when_a_change_that_arrived_from_the_server_is_written_locally", async () => {
      local.docs.tasks = [makeTask("local", "2026-07-18T10:00:00.000Z")]
      const remote = new FakeRemote()
      const {engine} = makeEngine(local, [{id: "a", adapter: remote}])
      engine.enableAutoSync()

      // The positive half this negative claim is measured against: a local-mutation request really
      // does schedule a real push (TC-17 proves this on its own too; repeated here as the baseline).
      requestsAPush(engine).requestPush()
      await vi.advanceTimersByTimeAsync(2500)
      const saveCountAfterTheLocalPush = remote.saveCount
      expect(saveCountAfterTheLocalPush).toBeGreaterThan(0)

      // sync() holds the mutex for its own one-second minimum-duration floor after the push
      // completes; let it release before driving a second sync through the same engine.
      await vi.advanceTimersByTimeAsync(1000)

      // Another device now writes a change straight to the remote. A pull merges it in locally;
      // that merge alone must not add another push.
      remote.snapshot = buildSnapshot({
        ...emptyDocs(),
        tasks: [...remote.snapshot!.docs.tasks, makeTask("fromServer", "2026-07-18T11:00:00.000Z")],
      })
      await engine.syncOnce("pull")
      expect(local.docs.tasks.map((t) => t.id).toSorted()).toEqual(["fromServer", "local"])

      await vi.advanceTimersByTimeAsync(2500)
      expect(remote.saveCount).toBe(saveCountAfterTheLocalPush)

      engine.disableAutoSync()
    })

    it("cancels_TC-20_a_scheduled_push_the_moment_auto_sync_is_turned_off", async () => {
      local.docs.tasks = [makeTask("t1", "2026-07-18T10:00:00.000Z")]
      const remote = new FakeRemote()
      const {engine} = makeEngine(local, [{id: "a", adapter: remote}])
      engine.enableAutoSync()

      requestsAPush(engine).requestPush()
      engine.disableAutoSync()

      await vi.advanceTimersByTimeAsync(3000)

      expect(remote.saveCount).toBe(0)
    })
  })
})
