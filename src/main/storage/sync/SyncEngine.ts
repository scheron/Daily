import {SYNC_CONFIG} from "@shared/config/sync"
import {RemoteSnapshotPendingError} from "@shared/errors/sync/RemoteSnapshotPendingError"
import {isString} from "@shared/utils/common/validators"
import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {AsyncMutex} from "@/utils/AsyncMutex"
import {createIntervalScheduler} from "@/utils/createIntervalScheduler"
import {logger} from "@/utils/logger"
import {mergeRemoteIntoLocal} from "@/utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshot, buildSnapshotMeta} from "@/utils/sync/snapshot/buildSnapshot"

import type {ILocalStorage, SnapshotDocs, SyncRemote, SyncStrategy} from "@/types/sync"
import type {SyncRemoteState, SyncStatus} from "@shared/types/storage"

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
  private onDataChanged: () => void
  private autoSyncScheduler: ReturnType<typeof createIntervalScheduler>

  constructor(
    private localStore: ILocalStorage,
    remotes: SyncRemote[],
    options: {
      assetsDir: () => string
      onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
      onDataChanged: () => void
    },
  ) {
    this.remotes = remotes
    this.assetsDir = options.assetsDir
    this.onStatusChange = options.onStatusChange
    this.onDataChanged = options.onDataChanged

    this.autoSyncScheduler = createIntervalScheduler({
      intervalMs: SYNC_CONFIG.remoteSyncInterval,
      onProcess: () => this.sync(),
    })

    this._initRemoteStates()
  }

  get syncStatus(): SyncStatus {
    return this._syncStatus
  }

  /** Replaces the remote set (e.g. when SSH settings change). State of removed remotes is dropped. */
  setRemotes(remotes: SyncRemote[]): void {
    this.remotes = remotes
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

    this._setStatus("inactive")
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
   * One-shot sync that works without enableAutoSync — used by the CLI around
   * commands. Unlike sync(), a total failure propagates to the caller.
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
   * snapshot differs from the merged state is pushed.
   */
  private async _sync(strategy: SyncStrategy = "pull"): Promise<void> {
    let localDocs = await this.localStore.loadAllDocs()
    let anyChanges = false
    let succeeded = 0
    const pushTargets: Array<{remote: SyncRemote; remoteDocs: SnapshotDocs | null}> = []
    const errors: unknown[] = []

    for (const remote of this.remotes) {
      try {
        const snapshot = await remote.adapter.loadSnapshot()
        const remoteDocs = snapshot ? this._normalizeSettings(snapshot.docs) : null

        if (remoteDocs && buildSnapshotMeta(localDocs).hash === snapshot!.meta.hash) {
          logger.debug(logger.CONTEXT.SYNC_ENGINE, `Remote "${remote.id}": hashes match, no merge needed`)
          pushTargets.push({remote, remoteDocs})
          continue
        }

        const {resultDocs, hasChanges} = await this._pull(localDocs, remoteDocs, strategy)
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

    if (anyChanges) {
      this.onDataChanged?.()
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
   * Normalize settings from old snapshot format where `data` was a JSON string.
   */
  private _normalizeSettings(docs: SnapshotDocs): SnapshotDocs {
    if (docs.settings) {
      let settings: any = docs.settings
      if ("data" in settings && isString(settings.data)) {
        const {id, data, created_at, updated_at} = settings
        settings = {id, ...JSON.parse(data), created_at, updated_at}
      }
      const {sync: _localSync, ...syncable} = settings
      docs.settings = syncable
    }
    return docs
  }

  /**
   * Pull phase: merge remote changes into local
   */
  private async _pull(
    localDocs: SnapshotDocs,
    remoteDocs: SnapshotDocs | null,
    strategy: SyncStrategy,
  ): Promise<{resultDocs: SnapshotDocs; hasChanges: boolean}> {
    logger.info(logger.CONTEXT.SYNC_PULL, "Pulling snapshot")

    if (!remoteDocs) {
      logger.debug(logger.CONTEXT.SYNC_PULL, "Remote snapshot not found")
      return {resultDocs: localDocs, hasChanges: false}
    }

    const mergeResult = mergeRemoteIntoLocal(localDocs, remoteDocs, strategy, SYNC_CONFIG.garbageCollectionInterval)

    const {resultDocs, toUpsert, toRemove, changes} = mergeResult

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
    files?: unknown[]
    events?: unknown[]
    settings?: unknown
  }): number {
    return (
      (docs.tasks?.length ?? 0) +
      (docs.tags?.length ?? 0) +
      (docs.branches?.length ?? 0) +
      (docs.files?.length ?? 0) +
      (docs.events?.length ?? 0) +
      (docs.settings ? 1 : 0)
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

  private _setStatus(status: SyncStatus) {
    const prevStatus = this._syncStatus
    this._syncStatus = status
    this.onStatusChange(status, prevStatus)
  }

  private _shouldPush(localDocs: SnapshotDocs, remoteDocs: SnapshotDocs | null): boolean {
    if (!remoteDocs) {
      const hasAnyData =
        localDocs.tasks.length > 0 || localDocs.tags.length > 0 || localDocs.branches.length > 0 || localDocs.files.length > 0 || !!localDocs.settings

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
