import {RemoteSnapshotPendingError, RemoteWriteConflictError, SYNC_CONFIG, syncPacingFor} from "@daily/protocol"
import {AsyncMutex, createIntervalScheduler, withElapsedDelay} from "@daily/std"

import {logger} from "../../utils/logger"
import {isRevisionedRemote} from "../../utils/sync/isRevisionedRemote"
import {mergeRemoteIntoLocal} from "../../utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshot, buildSnapshotMeta} from "../../utils/sync/snapshot/buildSnapshot"
import {rowToBranch, rowToMilestone, rowToTag, rowToTaskComment, rowToTaskRelation} from "../models/_rowMappers"

import type {
  ILocalStorage,
  IRevisionedRemoteStorage,
  MergeResult,
  SnapshotBranch,
  SnapshotDocs,
  SnapshotMilestone,
  SnapshotTag,
  SnapshotTask,
  SnapshotTaskComment,
  SnapshotTaskRelation,
  SyncPacing,
  SyncRemote,
  SyncRemoteState,
  SyncStatus,
  SyncStrategy,
  Tag,
  Task,
} from "@daily/protocol"
import type {Changeset} from "../../types/storage"

type RevisionedSyncOutcome = {
  resultDocs: SnapshotDocs
  hasChanges: boolean
  conflict: RemoteWriteConflictError | null
}

/**
 * SyncEngine orchestrates pull/push operations between local SQLite and a set
 * of remote storages.
 *
 * Architecture:
 * - Local-first: SQLite is always the source of truth
 * - Each remote is a "remote flash drive" - no server-side logic
 * - All merge logic happens locally using pure LWW (Last Write Wins) strategy
 * - Remotes are merged sequentially, then every remote whose hash differs from
 *   the merged local state receives a push (the node acts as a bridge)
 * - A failing remote is isolated: its error lands in per-remote state, the
 *   others continue; the whole sync fails only when every remote failed
 * - AsyncMutex prevents concurrent sync operations
 */
export class SyncEngine {
  private _syncStatus: SyncStatus = "inactive"
  private _isSyncEnabled = false
  private mutex = new AsyncMutex()
  private remotes: SyncRemote[]
  private remoteStates = new Map<string, {lastSyncAt: string | null; lastError: string | null}>()

  private readonly assetsDir: () => string
  private onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
  private onDataChanged: (changeset: Changeset) => void
  private autoSyncScheduler: ReturnType<typeof createIntervalScheduler>
  private pushDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private pacing: SyncPacing

  constructor(
    private localStore: ILocalStorage,
    remotes: SyncRemote[],
    options: {
      assetsDir: () => string
      onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
      onDataChanged: (changeset: Changeset) => void
    },
  ) {
    this.remotes = remotes
    this.assetsDir = options.assetsDir
    this.onStatusChange = options.onStatusChange
    this.onDataChanged = options.onDataChanged

    this.pacing = syncPacingFor(this.remotes[0]?.id)
    this.autoSyncScheduler = this._createAutoSyncScheduler()

    this._initRemoteStates()
  }

  get syncStatus(): SyncStatus {
    return this._syncStatus
  }

  /** Replaces the remote set (e.g. when iCloud settings change). State of removed remotes is dropped. */
  setRemotes(remotes: SyncRemote[]): void {
    this.remotes = remotes
    this._applyPacing()
    this._initRemoteStates()
  }

  /** Per-remote sync bookkeeping (last successful sync, last error) for the settings UI. */
  getRemoteStates(): SyncRemoteState[] {
    return this.remotes.map((remote) => {
      const state = this.remoteStates.get(remote.id) ?? {lastSyncAt: null, lastError: null}
      return {id: remote.id, label: remote.label, ...state}
    })
  }

  enableAutoSync() {
    if (this._isSyncEnabled) return

    this._isSyncEnabled = true
    this.autoSyncScheduler.start()

    this._setStatus("active")
  }

  disableAutoSync() {
    if (!this._isSyncEnabled) return

    this._isSyncEnabled = false
    this.autoSyncScheduler.stop()
    this._cancelPendingPush()

    this._setStatus("inactive")
  }

  /**
   * Requests a sync once the active provider's debounce has passed since the
   * last call, restarting the timer on each call so a burst of edits produces
   * one sync rather than one per edit. How long that is belongs to the
   * provider: iCloud pays for every write, the server does not. Runs the same
   * `sync()` the periodic scheduler runs, so the mutex, the status transitions
   * and the failure handling are not duplicated. Meant for local mutations; a
   * change that arrived from a remote should not call this.
   */
  requestPush(): void {
    this._cancelPendingPush()
    this.pushDebounceTimer = setTimeout(() => {
      this.pushDebounceTimer = null
      void this.sync()
    }, this.pacing.pushDebounceMs)
  }

  /**
   * Sync with all remotes, guarded by AsyncMutex. No-op unless auto-sync is
   * enabled; failures are swallowed into the "error" status (app cycle behavior).
   */
  async sync(strategy: SyncStrategy = "pull"): Promise<void> {
    if (!this._isSyncEnabled) return

    await this.mutex.runExclusive(async () => {
      this._setStatus("syncing")

      try {
        await withElapsedDelay(async () => await this._sync(strategy), 1_000)
        this._setStatus(this._isSyncEnabled ? "active" : "inactive")
      } catch {
        this._setStatus("error")
      }
    })
  }

  /**
   * One-shot sync that works without enableAutoSync — used around provider
   * migrations. Unlike sync(), a total failure propagates to the caller.
   */
  async syncOnce(strategy: SyncStrategy = "pull"): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this._setStatus("syncing")

      try {
        await this._sync(strategy)
        this._setStatus(this._isSyncEnabled ? "active" : "inactive")
      } catch (error) {
        this._setStatus("error")
        throw error
      }
    })
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
  private async _sync(strategy: SyncStrategy = "pull"): Promise<void> {
    const revisionedRemotes: Array<{remote: SyncRemote; adapter: IRevisionedRemoteStorage}> = []
    const plainRemotes: SyncRemote[] = []

    for (const remote of this.remotes) {
      if (isRevisionedRemote(remote.adapter)) revisionedRemotes.push({remote, adapter: remote.adapter})
      else plainRemotes.push(remote)
    }

    let localDocs = await this.localStore.loadAllDocs()
    let anyChanges = false
    let succeeded = 0
    const pushTargets: Array<{remote: SyncRemote; remoteDocs: SnapshotDocs | null}> = []
    const errors: unknown[] = []
    const changesetAcc = createChangesetAccumulator()

    for (const remote of plainRemotes) {
      try {
        const snapshot = await remote.adapter.loadSnapshot()
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
      try {
        const {resultDocs, hasChanges, conflict} = await this._syncRevisionedRemote(remote, adapter, localDocs, strategy, changesetAcc)
        localDocs = resultDocs
        anyChanges ||= hasChanges

        if (conflict) {
          logger.warn(
            logger.CONTEXT.SYNC_PUSH,
            `Remote "${remote.id}": conditional write lost ${SYNC_CONFIG.conditionalWriteMaxAttempts} races, deferring to the next cycle`,
          )
          this._recordRemoteError(remote.id, conflict)
          continue
        }

        succeeded++
        this._recordRemoteSuccess(remote.id)
      } catch (error) {
        if (error instanceof RemoteSnapshotPendingError) {
          logger.info(logger.CONTEXT.SYNC_REMOTE, `Remote "${remote.id}": snapshot still downloading, postponing`)
          continue
        }

        logger.error(logger.CONTEXT.SYNC_ENGINE, `Remote "${remote.id}": conditional sync failed`, error)
        this._recordRemoteError(remote.id, error)
        errors.push(error)
      }
    }

    if (anyChanges) {
      this.onDataChanged?.(buildChangeset(changesetAcc, localDocs.tags))
    }

    for (const {remote, remoteDocs} of pushTargets) {
      try {
        if (this._shouldPush(localDocs, remoteDocs)) {
          await this._push(remote, localDocs)
        } else {
          await this._syncAssets(remote, localDocs.files)
        }
        succeeded++
        this._recordRemoteSuccess(remote.id)
      } catch (error) {
        logger.error(logger.CONTEXT.SYNC_PUSH, `Remote "${remote.id}": failed to push`, error)
        this._recordRemoteError(remote.id, error)
        errors.push(error)
      }
    }

    if (this.remotes.length > 0 && succeeded === 0 && errors.length > 0) {
      throw errors[0]
    }
  }

  /**
   * Conditional-write path for a remote that declares revision support: read
   * the snapshot together with its revision, merge it into local through the
   * same `_pull` the plain remotes use, then write back only if that revision
   * still holds. A rejected write starts the next attempt from a fresh read,
   * never from the snapshot that lost the race.
   *
   * Attempts are bounded by `SYNC_CONFIG.conditionalWriteMaxAttempts`;
   * exhausting them is reported as a conflict for the caller to record, not
   * thrown, so a lost race defers to the next cycle instead of failing it.
   */
  private async _syncRevisionedRemote(
    remote: SyncRemote,
    adapter: IRevisionedRemoteStorage,
    localDocs: SnapshotDocs,
    strategy: SyncStrategy,
    changesetAcc: ChangesetAccumulator,
  ): Promise<RevisionedSyncOutcome> {
    let docs = localDocs
    let anyChanges = false
    let lastConflict: RemoteWriteConflictError | null = null

    for (let attempt = 1; attempt <= SYNC_CONFIG.conditionalWriteMaxAttempts; attempt++) {
      const {snapshot, revision} = await adapter.loadSnapshotWithRevision()
      const remoteDocs = snapshot?.docs ?? null

      const {resultDocs, hasChanges} = await this._pull(docs, remoteDocs, strategy, changesetAcc)
      docs = resultDocs
      anyChanges ||= hasChanges

      if (!this._shouldPush(docs, remoteDocs)) {
        await this._syncAssets(remote, docs.files)
        return {resultDocs: docs, hasChanges: anyChanges, conflict: null}
      }

      try {
        const nextSnapshot = buildSnapshot(docs)
        await adapter.saveSnapshotIfUnchanged(nextSnapshot, revision)

        logger.info(logger.CONTEXT.SYNC_PUSH, `Pushed snapshot ${nextSnapshot.meta.hash} to "${remote.id}" at revision ${revision ?? "none"}`)

        await this._syncAssets(remote, docs.files)

        return {resultDocs: docs, hasChanges: anyChanges, conflict: null}
      } catch (error) {
        if (!(error instanceof RemoteWriteConflictError)) throw error

        lastConflict = error
        logger.info(
          logger.CONTEXT.SYNC_PUSH,
          `Remote "${remote.id}": conditional write rejected at revision ${revision ?? "none"} (attempt ${attempt}), re-reading`,
        )
      }
    }

    return {resultDocs: docs, hasChanges: anyChanges, conflict: lastConflict}
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

    const upsertCount = this.countDocs(toUpsert)
    if (upsertCount) {
      logger.debug(logger.CONTEXT.SYNC_PULL, `Upserting ${upsertCount} documents`)
      await this.localStore.upsertDocs(toUpsert)
    }

    const removalCount = this.countDocs(toRemove)
    if (removalCount) {
      logger.debug(logger.CONTEXT.SYNC_PULL, `Deleting ${removalCount} documents`)
      await this.localStore.deleteDocs(toRemove)
    }

    logger.info(logger.CONTEXT.SYNC_PULL, `Pull result: ${changes} changes`)

    return {resultDocs, hasChanges: changes > 0}
  }

  private countDocs(docs: {
    tasks?: unknown[]
    tags?: unknown[]
    branches?: unknown[]
    milestones?: unknown[]
    relations?: unknown[]
    comments?: unknown[]
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
      (docs.files?.length ?? 0) +
      (docs.events?.length ?? 0)
    )
  }

  /**
   * Push phase: send merged local state to one remote + sync its assets
   */
  private async _push(remote: SyncRemote, localDocs: SnapshotDocs): Promise<void> {
    logger.info(logger.CONTEXT.SYNC_PUSH, `Pushing snapshot to "${remote.id}"`)

    const snapshot = buildSnapshot(localDocs)
    await remote.adapter.saveSnapshot(snapshot)

    logger.info(logger.CONTEXT.SYNC_PUSH, `Pushed snapshot ${snapshot.meta.hash} to "${remote.id}"`)

    await this._syncAssets(remote, localDocs.files)
  }

  private async _syncAssets(remote: SyncRemote, files: SnapshotDocs["files"]): Promise<void> {
    if (!files.length) return

    try {
      await remote.adapter.syncAssets(this.assetsDir(), files)
    } catch (error) {
      logger.warn(logger.CONTEXT.SYNC_PUSH, `Asset sync failed for "${remote.id}", will retry next cycle`, error)
    }
  }

  private _initRemoteStates(): void {
    const next = new Map<string, {lastSyncAt: string | null; lastError: string | null}>()
    for (const remote of this.remotes) {
      next.set(remote.id, this.remoteStates.get(remote.id) ?? {lastSyncAt: null, lastError: null})
    }
    this.remoteStates = next
  }

  private _recordRemoteSuccess(id: string): void {
    this.remoteStates.set(id, {lastSyncAt: new Date().toISOString(), lastError: null})
  }

  private _recordRemoteError(id: string, error: unknown): void {
    const prev = this.remoteStates.get(id)
    this.remoteStates.set(id, {
      lastSyncAt: prev?.lastSyncAt ?? null,
      lastError: error instanceof Error ? error.message : String(error),
    })
  }

  private _cancelPendingPush(): void {
    if (this.pushDebounceTimer === null) return
    clearTimeout(this.pushDebounceTimer)
    this.pushDebounceTimer = null
  }

  private _createAutoSyncScheduler(): ReturnType<typeof createIntervalScheduler> {
    return createIntervalScheduler({intervalMs: this.pacing.remoteSyncInterval, onProcess: () => this.sync()})
  }

  /**
   * Moves to the pacing the new remote set asks for. A changed debounce needs
   * nothing but the field; a changed interval has to be rebuilt, because the
   * scheduler takes its interval once, at construction.
   */
  private _applyPacing(): void {
    const previousInterval = this.pacing.remoteSyncInterval
    this.pacing = syncPacingFor(this.remotes[0]?.id)

    if (this.pacing.remoteSyncInterval === previousInterval) return

    this.autoSyncScheduler.stop()
    this.autoSyncScheduler = this._createAutoSyncScheduler()
    if (this._isSyncEnabled) this.autoSyncScheduler.start()
  }

  private _setStatus(status: SyncStatus) {
    const prevStatus = this._syncStatus
    this._syncStatus = status
    this.onStatusChange(status, prevStatus)
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

/** Every row a pull's merges upserted or removed, before it becomes the domain-shaped `Changeset` the caller is notified with. */
type ChangesetAccumulator = {
  tasks: {upserted: Map<string, SnapshotTask>; removed: Set<string>}
  tags: {upserted: Map<string, SnapshotTag>; removed: Set<string>}
  branches: {upserted: Map<string, SnapshotBranch>; removed: Set<string>}
  milestones: {upserted: Map<string, SnapshotMilestone>; removed: Set<string>}
  relations: {upserted: Map<string, SnapshotTaskRelation>; removed: Set<string>}
  comments: {upserted: Map<string, SnapshotTaskComment>; removed: Set<string>}
}

function createChangesetAccumulator(): ChangesetAccumulator {
  return {
    tasks: {upserted: new Map(), removed: new Set()},
    tags: {upserted: new Map(), removed: new Set()},
    branches: {upserted: new Map(), removed: new Set()},
    milestones: {upserted: new Map(), removed: new Set()},
    relations: {upserted: new Map(), removed: new Set()},
    comments: {upserted: new Map(), removed: new Set()},
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
    tags: row.tags.map((id) => tagsById.get(id)).filter((tag): tag is Tag => Boolean(tag)),
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

  return changeset
}
