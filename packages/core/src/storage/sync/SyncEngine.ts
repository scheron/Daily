import {RemoteSnapshotPendingError, RemoteWriteConflictError, SYNC_CONFIG, SYNC_REMOTE_ID, syncPacingFor} from "@daily/protocol"
import {AsyncMutex, createIntervalScheduler, withElapsedDelay} from "@daily/std"

import {logger} from "../../utils/logger"
import {isRevisionedRemote} from "../../utils/sync/isRevisionedRemote"
import {mergeRemoteIntoLocal} from "../../utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshot, buildSnapshotMeta} from "../../utils/sync/snapshot/buildSnapshot"
import {rowToBranch, rowToMilestone, rowToTag, rowToTaskComment, rowToTaskRelation} from "../models/_rowMappers"
import {SyncTransferError} from "./server/DailySyncClient"

import type {
  ILocalStorage,
  IRevisionedRemoteStorage,
  MergeResult,
  SnapshotBranch,
  SnapshotDocs,
  SnapshotMilestone,
  SnapshotRevision,
  SnapshotSubtask,
  SnapshotTag,
  SnapshotTask,
  SnapshotTaskComment,
  SnapshotTaskRelation,
  Subtask,
  SyncPacing,
  SyncRemote,
  SyncRemoteState,
  SyncStatus,
  SyncStrategy,
  Tag,
  Task,
} from "@daily/protocol"
import type {Changeset} from "../../types/storage"

type PendingCycle = {
  strategy: SyncStrategy
  expedited: boolean
  revision?: SnapshotRevision | null
  done: PromiseWithResolvers<void>
}

export class SyncEngine {
  private _syncStatus: SyncStatus = "inactive"
  private _isSyncEnabled = false
  private _mutex = new AsyncMutex()
  private _remotes: SyncRemote[]
  private _remoteStates = new Map<string, {lastSyncAt: string | null; lastError: string | null}>()
  private _reconciledRevision: {value: SnapshotRevision | null} | null = null
  private _activity = new AbortController()
  private _automaticCycleRunning = false
  private _pendingCycle: PendingCycle | null = null
  private _retryTimer: ReturnType<typeof setTimeout> | null = null
  private _retryFailures = 0
  private _pushWhileDisabled = false

  private readonly _assetsDir: () => string
  private readonly _onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
  private readonly _onDataChanged: (changeset: Changeset) => void
  private _autoSyncScheduler: ReturnType<typeof createIntervalScheduler>
  private _pushDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private _pacing: SyncPacing

  constructor(
    private _localStore: ILocalStorage,
    remotes: SyncRemote[],
    options: {
      assetsDir: () => string
      onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
      onDataChanged: (changeset: Changeset) => void
    },
  ) {
    this._remotes = remotes
    this._assetsDir = options.assetsDir
    this._onStatusChange = options.onStatusChange
    this._onDataChanged = options.onDataChanged

    this._pacing = syncPacingFor(this._remotes[0]?.id)
    this._autoSyncScheduler = this._createAutoSyncScheduler()

    this._initRemoteStates()
  }

  get syncStatus(): SyncStatus {
    return this._syncStatus
  }

  /** Replaces the remote set (e.g. when iCloud settings change). State of removed remotes is dropped. */
  setRemotes(remotes: SyncRemote[]): void {
    if (remotes.length === this._remotes.length && remotes.every((remote, index) => remote === this._remotes[index])) return

    this._cancelActivity()
    this._reconciledRevision = null
    for (const previous of this._remotes) {
      if (!remotes.some(({id, adapter}) => previous.id === id && previous.adapter === adapter)) this._remoteStates.delete(previous.id)
    }
    this._remotes = remotes
    this._applyPacing()
    this._initRemoteStates()
    if (this._isSyncEnabled) {
      this._setStatus("active")
      this._requestStartupSync()
    }
  }

  /** Per-remote sync bookkeeping (last successful sync, last error) for the settings UI. */
  getRemoteStates(): SyncRemoteState[] {
    return this._remotes.map((remote) => {
      const state = this._remoteStates.get(remote.id) ?? {lastSyncAt: null, lastError: null}
      return {id: remote.id, label: remote.label, ...state}
    })
  }

  enableAutoSync({reconciled = false}: {reconciled?: boolean} = {}) {
    if (this._isSyncEnabled) return

    this._isSyncEnabled = true
    this._autoSyncScheduler.start()

    this._setStatus("active")
    if (!reconciled) this._requestStartupSync()
    else if (this._pushWhileDisabled) this.requestPush()
    this._pushWhileDisabled = false
  }

  disableAutoSync() {
    this._isSyncEnabled = false
    this._autoSyncScheduler.stop()
    this._cancelActivity()

    if (this._syncStatus !== "inactive") this._setStatus("inactive")
  }

  requestPush(): void {
    if (!this._isSyncEnabled) {
      this._pushWhileDisabled = true
      return
    }
    this._schedulePush(this._pacing.pushDebounceMs)
  }

  observeRevision(revision: SnapshotRevision | null, reconnected: boolean): void {
    if (!reconnected && this._reconciledRevision?.value === revision) return
    void this._queueAutomaticCycle("pull", reconnected, reconnected ? {} : {revision})
  }

  /** A manual retry brings pending work forward, including a cycle in backoff. */
  sync(strategy: SyncStrategy = "pull"): Promise<void> {
    return this._queueAutomaticCycle(strategy, true)
  }

  /** Runs the migration cycle once and propagates a total failure. */
  async syncOnce(strategy: SyncStrategy = "pull"): Promise<void> {
    const {signal} = this._activity
    await this._mutex.runExclusive(async () => {
      signal.throwIfAborted()
      this._pushWhileDisabled = false
      this._setStatus("syncing")
      try {
        await this._sync(strategy, signal)
        signal.throwIfAborted()
        this._setStatus(this._isSyncEnabled ? "active" : "inactive")
      } catch (error) {
        if (!signal.aborted) this._setStatus("error")
        throw error
      }
    })
  }

  private _requestStartupSync(): void {
    if (this._remotes.some(({adapter}) => isRevisionedRemote(adapter))) void this._queueAutomaticCycle("pull", false)
    else if (this._remotes.some(({id}) => id === SYNC_REMOTE_ID.icloud)) this._schedulePush(500)
  }

  private _schedulePush(delayMs: number): void {
    this._cancelPendingPush()
    this._pushDebounceTimer = setTimeout(() => {
      this._pushDebounceTimer = null
      void this._queueAutomaticCycle("pull", false)
    }, delayMs)
  }

  private _cancelActivity(): void {
    this._activity.abort()
    this._activity = new AbortController()
    this._cancelPendingPush()
    this._clearRetryTimer()
    this._retryFailures = 0
    this._pendingCycle?.done.resolve()
    this._pendingCycle = null
  }

  private _queueAutomaticCycle(strategy: SyncStrategy, expedited: boolean, observation: {revision?: SnapshotRevision | null} = {}): Promise<void> {
    if (!this._isSyncEnabled) return Promise.resolve()

    const pending = this._pendingCycle ?? {strategy, expedited: false, ...observation, done: Promise.withResolvers<void>()}
    if (observation.revision === undefined) delete pending.revision
    else if (pending.revision !== undefined) pending.revision = observation.revision
    if (expedited) {
      pending.strategy = strategy
      pending.expedited = true
      this._clearRetryTimer()
    }
    this._pendingCycle = pending
    queueMicrotask(() => this._startPendingCycle())
    return pending.done.promise
  }

  private _startPendingCycle(): void {
    const pending = this._pendingCycle
    if (!pending || this._automaticCycleRunning || this._retryTimer !== null) return

    this._pendingCycle = null
    if (pending.revision !== undefined && this._reconciledRevision?.value === pending.revision && this._retryFailures === 0) {
      pending.done.resolve()
      return
    }

    this._automaticCycleRunning = true
    const {signal} = this._activity
    void this._runAutomaticCycle(pending.strategy, signal).finally(() => {
      this._automaticCycleRunning = false
      pending.done.resolve()
      this._startPendingCycle()
    })
  }

  private async _runAutomaticCycle(strategy: SyncStrategy, signal: AbortSignal): Promise<void> {
    await this._mutex.runExclusive(async () => {
      if (signal.aborted) return
      this._setStatus("syncing")
      let retry = false
      try {
        retry = this._remotes.some(({adapter}) => isRevisionedRemote(adapter))
          ? await this._sync(strategy, signal)
          : await withElapsedDelay(() => this._sync(strategy, signal), 1_000)
        if (!signal.aborted) this._setStatus("active")
      } catch (error) {
        if (signal.aborted) return
        retry = isRetryableTransfer(error)
        this._setStatus("error")
      }
      if (signal.aborted) return
      if (retry) this._scheduleRetry(strategy)
      else this._retryFailures = 0
    })
  }

  private _scheduleRetry(strategy: SyncStrategy): void {
    const ceilingMs = Math.min(60_000, 2_000 * 2 ** this._retryFailures)
    this._retryFailures = Math.min(this._retryFailures + 1, 5)
    if (this._pendingCycle?.expedited) return

    const delayMs = Math.round(ceilingMs * (0.5 + Math.random() * 0.5))
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null
      void this._queueAutomaticCycle(strategy, false)
    }, delayMs)
  }

  private _clearRetryTimer(): void {
    if (this._retryTimer !== null) clearTimeout(this._retryTimer)
    this._retryTimer = null
  }

  /**
   * Core sync logic.
   *
   * @param strategy:
   *   - "pull" (default): LWW-merge with priority to remote when updated_at is equal
   *   - "push": LWW-merge with priority to local when updated_at is equal
   * Remotes are merged into local sequentially; afterwards every remote whose
   * snapshot differs from the merged state is pushed. A remote declaring
   * revision support is handled apart from that two-pass shape, in a bounded
   * read-merge-write loop of its own.
   */
  private async _sync(strategy: SyncStrategy, signal: AbortSignal): Promise<boolean> {
    const revisionedRemotes: Array<{remote: SyncRemote; adapter: IRevisionedRemoteStorage}> = []
    const plainRemotes: SyncRemote[] = []

    for (const remote of this._remotes) {
      if (isRevisionedRemote(remote.adapter)) revisionedRemotes.push({remote, adapter: remote.adapter})
      else plainRemotes.push(remote)
    }

    let localDocs = plainRemotes.length ? await this._localStore.loadAllDocs() : null
    signal.throwIfAborted()
    let anyChanges = false
    let retry = false
    let succeeded = 0
    const pushTargets: Array<{remote: SyncRemote; remoteDocs: SnapshotDocs | null}> = []
    const errors: unknown[] = []
    const changesetAcc = createChangesetAccumulator()

    for (const remote of plainRemotes) {
      if (!localDocs || signal.aborted) break
      try {
        const snapshot = await remote.adapter.loadSnapshot()
        signal.throwIfAborted()
        const remoteDocs = snapshot?.docs ?? null

        if (remoteDocs && buildSnapshotMeta(localDocs).hash === snapshot!.meta.hash) {
          logger.debug(logger.CONTEXT.SYNC_ENGINE, `Remote "${remote.id}": hashes match, no merge needed`)
          pushTargets.push({remote, remoteDocs})
          continue
        }

        const {resultDocs, hasChanges} = await this._pull(localDocs, remoteDocs, strategy, changesetAcc)
        localDocs = resultDocs
        anyChanges ||= hasChanges
        pushTargets.push({remote, remoteDocs})
      } catch (error) {
        if (signal.aborted) break
        if (error instanceof RemoteSnapshotPendingError) {
          logger.info(logger.CONTEXT.SYNC_REMOTE, `Remote "${remote.id}": snapshot still downloading, postponing`)
          continue
        }

        logger.error(logger.CONTEXT.SYNC_ENGINE, `Remote "${remote.id}": failed to load/merge`, error)
        this._recordRemoteError(remote.id, error)
        errors.push(error)
      }
    }

    for (const {remote, adapter} of revisionedRemotes) {
      if (signal.aborted) break
      try {
        const {docs, conflict} = await this._syncRevisionedRemote(remote, adapter, strategy, signal)
        signal.throwIfAborted()
        localDocs = docs

        if (conflict) {
          logger.warn(
            logger.CONTEXT.SYNC_PUSH,
            `Remote "${remote.id}": conditional write lost ${SYNC_CONFIG.conditionalWriteMaxAttempts} races, deferring to the next cycle`,
          )
          this._recordRemoteError(remote.id, conflict)
          retry = true
          continue
        }

        succeeded++
        this._recordRemoteSuccess(remote.id)
      } catch (error) {
        if (signal.aborted) break
        if (error instanceof RemoteSnapshotPendingError) {
          logger.info(logger.CONTEXT.SYNC_REMOTE, `Remote "${remote.id}": snapshot still downloading, postponing`)
          continue
        }

        retry ||= isRetryableTransfer(error)
        logger.error(logger.CONTEXT.SYNC_ENGINE, `Remote "${remote.id}": conditional sync failed`, error)
        this._recordRemoteError(remote.id, error)
        errors.push(error)
      }
    }

    if (anyChanges && localDocs) {
      this._onDataChanged?.(buildChangeset(changesetAcc, localDocs.tags))
    }
    signal.throwIfAborted()

    for (const {remote, remoteDocs} of pushTargets) {
      if (!localDocs) break
      try {
        if (this._shouldPush(localDocs, remoteDocs)) {
          await this._push(remote, localDocs, signal)
        } else {
          await this._syncAssets(remote, localDocs.files, signal)
        }
        signal.throwIfAborted()
        succeeded++
        this._recordRemoteSuccess(remote.id)
      } catch (error) {
        signal.throwIfAborted()
        logger.error(logger.CONTEXT.SYNC_PUSH, `Remote "${remote.id}": failed to push`, error)
        this._recordRemoteError(remote.id, error)
        errors.push(error)
      }
    }

    if (this._remotes.length > 0 && succeeded === 0 && errors.length > 0) {
      throw errors.find(isRetryableTransfer) ?? errors[0]
    }
    return retry
  }

  private async _syncRevisionedRemote(
    remote: SyncRemote,
    adapter: IRevisionedRemoteStorage,
    strategy: SyncStrategy,
    signal: AbortSignal,
  ): Promise<{docs: SnapshotDocs; conflict?: RemoteWriteConflictError}> {
    let recoveredAmbiguousWrite = false

    for (let attempt = 1; ; attempt++) {
      const {snapshot, revision} = await adapter.loadSnapshotWithRevision(signal)
      signal.throwIfAborted()
      if ((snapshot === null) !== (revision === null)) {
        throw new SyncTransferError("terminal", "The server's snapshot and revision disagree")
      }
      const remoteDocs = snapshot?.docs ?? null
      const {resultDocs: docs} = await this._localStore.mergeAndApply(
        remoteDocs,
        strategy,
        ({changes, toUpsert, toRemove, resultDocs}) => {
          this._pushWhileDisabled = false
          if (!changes) return
          const delta = createChangesetAccumulator()
          accumulateDelta(delta, toUpsert, toRemove)
          this._onDataChanged(buildChangeset(delta, resultDocs.tags))
        },
        signal,
      )
      signal.throwIfAborted()

      let reconciledRevision = revision
      if (this._shouldPush(docs, remoteDocs)) {
        try {
          const nextSnapshot = buildSnapshot(docs)
          reconciledRevision = await adapter.saveSnapshotIfUnchanged(nextSnapshot, revision, signal)
          signal.throwIfAborted()
          logger.info(logger.CONTEXT.SYNC_PUSH, `Pushed snapshot ${nextSnapshot.meta.hash} to "${remote.id}" at revision ${reconciledRevision}`)
        } catch (error) {
          signal.throwIfAborted()
          if (error instanceof RemoteWriteConflictError) {
            if (attempt >= SYNC_CONFIG.conditionalWriteMaxAttempts) return {docs, conflict: error}
            continue
          }
          if (error instanceof SyncTransferError && error.kind === "ambiguous" && !recoveredAmbiguousWrite) {
            recoveredAmbiguousWrite = true
            continue
          }
          throw error
        }
      }

      this._reconciledRevision = {value: reconciledRevision}
      await this._syncAssets(remote, docs.files, signal)
      return {docs}
    }
  }

  /**
   * Pull phase: merge remote changes into local, folding what it upserted and removed into
   * `changesetAcc` — the caller emits it once, after every remote for this sync has pulled.
   */
  private async _pull(
    localDocs: SnapshotDocs,
    remoteDocs: SnapshotDocs | null,
    strategy: SyncStrategy,
    changesetAcc: ChangesetAccumulator,
  ): Promise<{resultDocs: SnapshotDocs; hasChanges: boolean}> {
    logger.info(logger.CONTEXT.SYNC_PULL, "Pulling snapshot")

    if (!remoteDocs) {
      logger.debug(logger.CONTEXT.SYNC_PULL, "Remote snapshot not found")
      return {resultDocs: localDocs, hasChanges: false}
    }

    const mergeResult = mergeRemoteIntoLocal(localDocs, remoteDocs, strategy, SYNC_CONFIG.garbageCollectionInterval)

    const {resultDocs, toUpsert, toRemove, changes} = mergeResult
    accumulateDelta(changesetAcc, toUpsert, toRemove)

    const upsertCount = this._countDocs(toUpsert)
    if (upsertCount) {
      logger.debug(logger.CONTEXT.SYNC_PULL, `Upserting ${upsertCount} documents`)
      await this._localStore.upsertDocs(toUpsert)
    }

    const removalCount = this._countDocs(toRemove)
    if (removalCount) {
      logger.debug(logger.CONTEXT.SYNC_PULL, `Deleting ${removalCount} documents`)
      await this._localStore.deleteDocs(toRemove)
    }

    logger.info(logger.CONTEXT.SYNC_PULL, `Pull result: ${changes} changes`)

    return {resultDocs, hasChanges: changes > 0}
  }

  private _countDocs(docs: {
    tasks?: unknown[]
    tags?: unknown[]
    branches?: unknown[]
    milestones?: unknown[]
    relations?: unknown[]
    comments?: unknown[]
    subtasks?: unknown[]
    files?: unknown[]
    events?: unknown[]
  }): number {
    return (
      (docs.tasks?.length ?? 0) +
      (docs.tags?.length ?? 0) +
      (docs.branches?.length ?? 0) +
      (docs.milestones?.length ?? 0) +
      (docs.relations?.length ?? 0) +
      (docs.comments?.length ?? 0) +
      (docs.subtasks?.length ?? 0) +
      (docs.files?.length ?? 0) +
      (docs.events?.length ?? 0)
    )
  }

  /**
   * Push phase: send merged local state to one remote + sync its assets
   */
  private async _push(remote: SyncRemote, localDocs: SnapshotDocs, signal: AbortSignal): Promise<void> {
    logger.info(logger.CONTEXT.SYNC_PUSH, `Pushing snapshot to "${remote.id}"`)

    const snapshot = buildSnapshot(localDocs)
    await remote.adapter.saveSnapshot(snapshot)
    signal.throwIfAborted()

    logger.info(logger.CONTEXT.SYNC_PUSH, `Pushed snapshot ${snapshot.meta.hash} to "${remote.id}"`)

    await this._syncAssets(remote, localDocs.files, signal)
  }

  private async _syncAssets(remote: SyncRemote, files: SnapshotDocs["files"], signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (!files.length) return

    try {
      await remote.adapter.syncAssets(this._assetsDir(), files, signal)
      signal.throwIfAborted()
    } catch (error) {
      signal.throwIfAborted()
      logger.warn(logger.CONTEXT.SYNC_PUSH, `Asset sync failed for "${remote.id}", will retry next cycle`, error)
    }
  }

  private _initRemoteStates(): void {
    const next = new Map<string, {lastSyncAt: string | null; lastError: string | null}>()
    for (const remote of this._remotes) {
      next.set(remote.id, this._remoteStates.get(remote.id) ?? {lastSyncAt: null, lastError: null})
    }
    this._remoteStates = next
  }

  private _recordRemoteSuccess(id: string): void {
    this._remoteStates.set(id, {lastSyncAt: new Date().toISOString(), lastError: null})
  }

  private _recordRemoteError(id: string, error: unknown): void {
    const prev = this._remoteStates.get(id)
    this._remoteStates.set(id, {
      lastSyncAt: prev?.lastSyncAt ?? null,
      lastError: error instanceof Error ? error.message : String(error),
    })
  }

  private _cancelPendingPush(): void {
    if (this._pushDebounceTimer === null) return
    clearTimeout(this._pushDebounceTimer)
    this._pushDebounceTimer = null
  }

  private _createAutoSyncScheduler(): ReturnType<typeof createIntervalScheduler> {
    return createIntervalScheduler({
      intervalMs: this._pacing.remoteSyncInterval,
      onProcess: async () => {
        void this._queueAutomaticCycle("pull", false)
      },
    })
  }

  /**
   * Moves to the pacing the new remote set asks for. A changed debounce needs
   * nothing but the field; a changed interval has to be rebuilt, because the
   * scheduler takes its interval once, at construction.
   */
  private _applyPacing(): void {
    const previousInterval = this._pacing.remoteSyncInterval
    this._pacing = syncPacingFor(this._remotes[0]?.id)

    if (this._pacing.remoteSyncInterval === previousInterval) return

    this._autoSyncScheduler.stop()
    this._autoSyncScheduler = this._createAutoSyncScheduler()
    if (this._isSyncEnabled) this._autoSyncScheduler.start()
  }

  private _setStatus(status: SyncStatus) {
    const prevStatus = this._syncStatus
    this._syncStatus = status
    this._onStatusChange(status, prevStatus)
  }

  private _shouldPush(localDocs: SnapshotDocs, remoteDocs: SnapshotDocs | null): boolean {
    if (!remoteDocs) {
      const hasAnyData = localDocs.tasks.length > 0 || localDocs.tags.length > 0 || localDocs.branches.length > 0 || localDocs.files.length > 0

      if (hasAnyData) {
        logger.debug(logger.CONTEXT.SYNC_PUSH, "No remote snapshot, local has data, need push")
        return true
      }

      logger.debug(logger.CONTEXT.SYNC_PUSH, "No remote snapshot and no local data, no push needed")
      return false
    }

    const localMeta = buildSnapshotMeta(localDocs)
    const remoteMeta = buildSnapshotMeta(remoteDocs)

    if (localMeta.hash !== remoteMeta.hash) {
      logger.debug(logger.CONTEXT.SYNC_PUSH, "Hashes mismatch, need push")
      return true
    }

    logger.debug(logger.CONTEXT.SYNC_PUSH, "No changes detected, no push")
    return false
  }
}

function isRetryableTransfer(error: unknown): boolean {
  return error instanceof SyncTransferError && (error.kind === "transient" || error.kind === "ambiguous")
}

/** Every row a pull's merges upserted or removed, before it becomes the domain-shaped `Changeset` the caller is notified with. */
type ChangesetAccumulator = {
  tasks: {upserted: Map<string, SnapshotTask>; removed: Set<string>}
  tags: {upserted: Map<string, SnapshotTag>; removed: Set<string>}
  branches: {upserted: Map<string, SnapshotBranch>; removed: Set<string>}
  milestones: {upserted: Map<string, SnapshotMilestone>; removed: Set<string>}
  relations: {upserted: Map<string, SnapshotTaskRelation>; removed: Set<string>}
  comments: {upserted: Map<string, SnapshotTaskComment>; removed: Set<string>}
  subtasks: {upserted: Map<string, SnapshotSubtask>; removed: Set<string>}
}

function createChangesetAccumulator(): ChangesetAccumulator {
  return {
    tasks: {upserted: new Map(), removed: new Set()},
    tags: {upserted: new Map(), removed: new Set()},
    branches: {upserted: new Map(), removed: new Set()},
    milestones: {upserted: new Map(), removed: new Set()},
    relations: {upserted: new Map(), removed: new Set()},
    comments: {upserted: new Map(), removed: new Set()},
    subtasks: {upserted: new Map(), removed: new Set()},
  }
}

/** Folds one pull's delta in: a later upsert overwrites an earlier one for the same id, and either side clears the other. */
function accumulateCollection<D extends {id: string}>(
  acc: {upserted: Map<string, D>; removed: Set<string>},
  upserted: D[],
  removed: string[] = [],
): void {
  for (const doc of upserted) {
    acc.upserted.set(doc.id, doc)
    acc.removed.delete(doc.id)
  }
  for (const id of removed) {
    acc.removed.add(id)
    acc.upserted.delete(id)
  }
}

function accumulateDelta(acc: ChangesetAccumulator, toUpsert: SnapshotDocs, toRemove: MergeResult["toRemove"]): void {
  accumulateCollection(acc.tasks, toUpsert.tasks, toRemove.tasks)
  accumulateCollection(acc.tags, toUpsert.tags, toRemove.tags)
  accumulateCollection(acc.branches, toUpsert.branches, toRemove.branches)
  accumulateCollection(acc.milestones, toUpsert.milestones, toRemove.milestones)
  accumulateCollection(acc.relations, toUpsert.relations, toRemove.relations)
  accumulateCollection(acc.comments, toUpsert.comments, toRemove.comments)
  accumulateCollection(acc.subtasks, toUpsert.subtasks, toRemove.subtasks)
}

/** A task as the merge left it, resolved against `tagsById` — the final merged tag set, not just the tags a pull happened to touch. */
function snapshotTaskToTask(row: SnapshotTask, tagsById: Map<string, Tag>): Task {
  return {
    id: row.id,
    status: row.status as Task["status"],
    content: row.content,
    minimized: row.minimized,
    orderIndex: row.order_index,
    scheduled:
      row.scheduled_date === null ? null : {date: row.scheduled_date, time: row.scheduled_time as string, timezone: row.scheduled_timezone as string},
    estimatedTime: row.estimated_time,
    spentTime: row.spent_time,
    branchId: row.branch_id,
    milestoneId: row.milestone_id,
    priority: row.priority as Task["priority"],
    tags: row.tags.map((id) => tagsById.get(id)).filter((tag): tag is Tag => Boolean(tag)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

function snapshotSubtaskToSubtask(row: SnapshotSubtask): Subtask {
  return {
    id: row.id,
    taskId: row.task_id,
    content: row.content,
    done: row.done,
    orderKey: row.order_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

/** Builds the `Changeset` a pull emits from everything its merges accumulated. `finalTags` resolves a task's tags even when the tag itself did not change. */
function buildChangeset(acc: ChangesetAccumulator, finalTags: SnapshotTag[]): Changeset {
  const changeset: Changeset = {}
  const tagsById = new Map(finalTags.map((t) => [t.id, rowToTag(t)]))

  if (acc.tasks.upserted.size || acc.tasks.removed.size) {
    changeset.tasks = {}
    if (acc.tasks.upserted.size) changeset.tasks.upserted = [...acc.tasks.upserted.values()].map((t) => snapshotTaskToTask(t, tagsById))
    if (acc.tasks.removed.size) changeset.tasks.removed = [...acc.tasks.removed]
  }

  if (acc.tags.upserted.size || acc.tags.removed.size) {
    changeset.tags = {}
    if (acc.tags.upserted.size) changeset.tags.upserted = [...acc.tags.upserted.values()].map(rowToTag)
    if (acc.tags.removed.size) changeset.tags.removed = [...acc.tags.removed]
  }

  if (acc.branches.upserted.size || acc.branches.removed.size) {
    changeset.branches = {}
    if (acc.branches.upserted.size) changeset.branches.upserted = [...acc.branches.upserted.values()].map(rowToBranch)
    if (acc.branches.removed.size) changeset.branches.removed = [...acc.branches.removed]
  }

  if (acc.milestones.upserted.size || acc.milestones.removed.size) {
    changeset.milestones = {}
    if (acc.milestones.upserted.size) changeset.milestones.upserted = [...acc.milestones.upserted.values()].map(rowToMilestone)
    if (acc.milestones.removed.size) changeset.milestones.removed = [...acc.milestones.removed]
  }

  if (acc.relations.upserted.size || acc.relations.removed.size) {
    changeset.relations = {}
    if (acc.relations.upserted.size) changeset.relations.upserted = [...acc.relations.upserted.values()].map(rowToTaskRelation)
    if (acc.relations.removed.size) changeset.relations.removed = [...acc.relations.removed]
  }

  if (acc.comments.upserted.size || acc.comments.removed.size) {
    changeset.comments = {}
    if (acc.comments.upserted.size) changeset.comments.upserted = [...acc.comments.upserted.values()].map(rowToTaskComment)
    if (acc.comments.removed.size) changeset.comments.removed = [...acc.comments.removed]
  }

  if (acc.subtasks.upserted.size || acc.subtasks.removed.size) {
    changeset.subtasks = {}
    if (acc.subtasks.upserted.size) changeset.subtasks.upserted = [...acc.subtasks.upserted.values()].map(snapshotSubtaskToSubtask)
    if (acc.subtasks.removed.size) changeset.subtasks.removed = [...acc.subtasks.removed]
  }

  return changeset
}
