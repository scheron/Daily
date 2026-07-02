import {RemoteSnapshotPendingError} from "@shared/errors/sync/RemoteSnapshotPendingError"
import {isString} from "@shared/utils/common/validators"
import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {AsyncMutex} from "@/utils/AsyncMutex"
import {createIntervalScheduler} from "@/utils/createIntervalScheduler"
import {logger} from "@/utils/logger"
import {mergeRemoteIntoLocal} from "@/utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshot, buildSnapshotMeta} from "@/utils/sync/snapshot/buildSnapshot"

import {APP_CONFIG, fsPaths} from "@/config"

import type {ILocalStorage, IRemoteStorage, SnapshotDocs, SyncStrategy} from "@/types/sync"
import type {SyncStatus} from "@shared/types/storage"

/**
 * SyncEngine orchestrates pull/push operations between local SQLite and remote storage.
 *
 * Architecture:
 * - Local-first: SQLite is always the source of truth
 * - Remote storage is treated as a "remote flash drive" - no server-side logic
 * - All merge logic happens locally using pure LWW (Last Write Wins) strategy
 * - AsyncMutex prevents concurrent sync operations
 */
export class SyncEngine {
  private _syncStatus: SyncStatus = "inactive"
  private _isSyncEnabled = false
  private mutex = new AsyncMutex()

  private onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
  private onDataChanged: () => void
  private autoSyncScheduler: ReturnType<typeof createIntervalScheduler>

  constructor(
    private localStore: ILocalStorage,
    private remoteStore: IRemoteStorage,
    options: {
      onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
      onDataChanged: () => void
    },
  ) {
    this.onStatusChange = options.onStatusChange
    this.onDataChanged = options.onDataChanged

    this.autoSyncScheduler = createIntervalScheduler({
      intervalMs: APP_CONFIG.sync.remoteSyncInterval,
      onProcess: () => this.sync(),
    })
  }

  get syncStatus(): SyncStatus {
    return this._syncStatus
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
   * Sync with remote storage, guarded by AsyncMutex.
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
   * Core sync logic.
   *
   * @param strategy:
   *   - "pull" (default): LWW-merge with priority to remote when updated_at is equal
   *   - "push": LWW-merge with priority to local when updated_at is equal
   * After merge, if the local snapshot is different from remote, it is pushed to remote.
   */
  private async _sync(strategy: SyncStrategy = "pull"): Promise<void> {
    if (!this._isSyncEnabled) return

    try {
      const localDocs = await this.localStore.loadAllDocs()
      const localMeta = buildSnapshotMeta(localDocs)

      let remoteSnapshot: Awaited<ReturnType<IRemoteStorage["loadSnapshot"]>>
      try {
        remoteSnapshot = await this.remoteStore.loadSnapshot()
      } catch (error) {
        if (error instanceof RemoteSnapshotPendingError) {
          logger.info(logger.CONTEXT.SYNC_REMOTE, "Remote snapshot is still downloading from iCloud, postponing sync")
          return
        }

        throw error
      }

      let remoteDocs: SnapshotDocs | null = null
      let remoteMeta: {updatedAt: string; hash: string} | null = null

      if (remoteSnapshot) {
        remoteDocs = this._normalizeSettings(remoteSnapshot.docs)
        remoteMeta = remoteSnapshot.meta
      }

      if (remoteDocs && remoteMeta && localMeta.hash === remoteMeta.hash) {
        logger.debug(logger.CONTEXT.SYNC_ENGINE, "Hashes match, no changes detected")
        await this._syncAssets(localDocs.files)
        return
      }

      const {resultDocs, hasChanges} = await this._pull(localDocs, remoteDocs, strategy)

      if (hasChanges) {
        this.onDataChanged?.()
      }

      if (this._shouldPush(resultDocs, remoteDocs)) {
        await this._push(resultDocs)
      } else {
        await this._syncAssets(resultDocs.files)
      }
    } catch (error) {
      logger.error(logger.CONTEXT.SYNC_ENGINE, "Failed to sync", error)
      throw error
    }
  }

  /**
   * Normalize settings from old snapshot format where `data` was a JSON string.
   */
  private _normalizeSettings(docs: SnapshotDocs): SnapshotDocs {
    if (docs.settings && "data" in docs.settings && isString((docs.settings as any).data)) {
      const {id, data, created_at, updated_at} = docs.settings as any
      const parsed = JSON.parse(data)
      docs.settings = {id, ...parsed, created_at, updated_at}
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

    const mergeResult = mergeRemoteIntoLocal(localDocs, remoteDocs, strategy, APP_CONFIG.sync.garbageCollectionInterval)

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
   * Push phase: send local changes to remote + sync assets
   */
  private async _push(localDocs: SnapshotDocs): Promise<void> {
    logger.info(logger.CONTEXT.SYNC_PUSH, "Pushing snapshot")

    const snapshot = buildSnapshot(localDocs)
    await this.remoteStore.saveSnapshot(snapshot)

    logger.info(logger.CONTEXT.SYNC_PUSH, `Pushed snapshot ${snapshot.meta.hash}`)

    await this._syncAssets(localDocs.files)
  }

  private async _syncAssets(files: SnapshotDocs["files"]): Promise<void> {
    if (!files.length) return

    try {
      await this.remoteStore.syncAssets(fsPaths.assetsDir(), files)
    } catch (error) {
      logger.warn(logger.CONTEXT.SYNC_PUSH, "Asset sync failed, will retry next cycle", error)
    }
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
