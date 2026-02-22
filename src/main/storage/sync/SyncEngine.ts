import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {createIntervalScheduler} from "@/utils/createIntervalScheduler"
import {logger} from "@/utils/logger"
import {mergeRemoteIntoLocal} from "@/utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshot, buildSnapshotMeta} from "@/utils/sync/snapshot/buildSnapshot"

import {APP_CONFIG} from "@/config"

import type {ILocalStorage, IRemoteStorage, SnapshotDocs, SyncStrategy} from "@/types/sync"
import type {SyncStatus} from "@shared/types/storage"

/**
 * SyncEngine is the core synchronization engine that orchestrates pull/push operations
 * between local PouchDB and remote storage backend.
 *
 * Architecture:
 * - Local-first: PouchDB is always the source of truth
 * - Remote storage is treated as a "remote flash drive" - no server-side logic
 * - All merge logic happens locally using pure LWW (Last Write Wins) strategy
 * - Integrated auto-sync scheduler for automatic synchronization

 * Soft-Delete Strategy:
 * - Documents with deletedAt !== null are considered soft-deleted
 * - Soft-deleted documents are synced like normal documents
 * - Garbage collection is handled by the local store automatically
 *
 * Permanent Delete Strategy:
 * - Uses epoch timestamp (1970-01-01) for deletedAt
 * - isExpired() returns true immediately for epoch timestamps
 * - Triggers automatic garbage collection on next sync
 * - Syncs deletion across all devices via snapshot system
 */
export class SyncEngine {
  private GC_INTERVAL_MS = APP_CONFIG.sync.garbageCollectionInterval

  private _syncStatus: SyncStatus = "inactive"
  private _isSyncEnabled = false

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

  enableAutoSync(): void {
    if (this._isSyncEnabled) return

    this._isSyncEnabled = true
    this.autoSyncScheduler.start()

    this._setStatus("active")
  }

  disableAutoSync(): void {
    if (!this._isSyncEnabled) return

    this._isSyncEnabled = false
    this.autoSyncScheduler.stop()

    this._setStatus("inactive")
  }

  /**
   * Sync with remote storage.
   * @see _sync
   */
  async sync(strategy: "pull" | "push" = "pull"): Promise<void> {
    if (!this._isSyncEnabled) return

    this._setStatus("syncing")

    try {
      await withElapsedDelay(async () => await this._sync(strategy), 1_000)
      this._setStatus(this._isSyncEnabled ? "active" : "inactive")
    } catch {
      this._setStatus("error")
    }
  }

  /**
   * Sync with remote storage.
   *
   * @param strategy:
   *   - "pull" (default): LWW-merge with priority to remote when updatedAt is equal
   *   - "push": LWW-merge with priority to local when updatedAt is equal
   * After merge, if the local snapshot is different from remote, it is pushed to remote.
   */
  async _sync(strategy: "pull" | "push" = "pull"): Promise<void> {
    if (!this._isSyncEnabled) return

    try {
      const localDocs = await this.localStore.loadAllDocs()
      const localMeta = buildSnapshotMeta(localDocs)
      const {docs: remoteDocs, meta: remoteMeta} = (await this.remoteStore.loadSnapshot()) ?? {docs: null, meta: null}

      if (remoteDocs && remoteMeta && localMeta.hash === remoteMeta.hash) {
        logger.debug(logger.CONTEXT.SYNC_ENGINE, "Hashes match, no changes detected")
        return
      }

      const {resultDocs, hasChanges} = await this._pull(localDocs, remoteDocs, strategy)

      if (hasChanges) {
        this.onDataChanged?.()
      }

      if (this._shouldPush(resultDocs, remoteDocs)) {
        await this._push(resultDocs)
      }
    } catch (error) {
      logger.error(logger.CONTEXT.SYNC_ENGINE, "Failed to sync", error)
      throw error
    }
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

    const {resultDocs, toUpsert, toRemove, changes} = await mergeRemoteIntoLocal(
      localDocs,
      remoteDocs,
      strategy,
      APP_CONFIG.sync.garbageCollectionInterval,
    )

    if (toUpsert.length) {
      logger.debug(logger.CONTEXT.SYNC_PULL, `Upserting ${toUpsert.length} documents`)
      await this.localStore.upsertDocs(toUpsert)
    }

    if (toRemove.length) {
      logger.debug(logger.CONTEXT.SYNC_PULL, `Deleting ${toRemove.length} documents`)
      await this.localStore.deleteDocs(toRemove)
    }

    logger.info(logger.CONTEXT.SYNC_PULL, `Pull result: ${changes} changes`)

    return {resultDocs: resultDocs, hasChanges: changes > 0}
  }

  /**
   * Push phase: send local changes to remote
   */
  private async _push(localDocs: SnapshotDocs): Promise<void> {
    logger.info(logger.CONTEXT.SYNC_PUSH, "Pushing snapshot")

    const snapshot = buildSnapshot(localDocs)
    await this.remoteStore.saveSnapshot(snapshot)

    logger.info(logger.CONTEXT.SYNC_PUSH, `Pushed snapshot ${snapshot.meta.hash}`)
  }

  private _setStatus(status: SyncStatus): void {
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
