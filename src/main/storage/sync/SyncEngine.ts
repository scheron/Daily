import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {AsyncMutex} from "@/utils/AsyncMutex"
import {createIntervalScheduler} from "@/utils/createIntervalScheduler"
import {logger} from "@/utils/logger"
import {mergeRemoteIntoLocal} from "@/utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshot, buildSnapshotMeta} from "@/utils/sync/snapshot/buildSnapshot"

import {APP_CONFIG, fsPaths} from "@/config"

import type {ILocalStorage, IRemoteStorage, MergeResult, Snapshot, SnapshotV2Docs, SyncStrategy} from "@/types/sync"
import type {SyncStatus} from "@shared/types/storage"

/**
 * SyncEngine orchestrates pull/push operations between local SQLite and remote storage.
 *
 * Architecture:
 * - Local-first: SQLite is always the source of truth
 * - Remote storage is treated as a "remote flash drive" - no server-side logic
 * - All merge logic happens locally using pure LWW (Last Write Wins) strategy
 * - AsyncMutex prevents concurrent sync operations
 * - Supports V1 → V2 snapshot conversion for backward compatibility
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

      const remoteSnapshot = await this.remoteStore.loadSnapshot()
      let remoteDocs: SnapshotV2Docs | null = null
      let remoteMeta: {updatedAt: string; hash: string} | null = null

      if (remoteSnapshot) {
        remoteDocs = this._extractV2Docs(remoteSnapshot)
        remoteMeta = remoteSnapshot.meta
      }

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
   * Extract V2 docs from a snapshot, converting V1 if necessary.
   */
  private _extractV2Docs(snapshot: Snapshot): SnapshotV2Docs {
    if (snapshot.version === 2) {
      return snapshot.docs
    }

    // V1 → V2 conversion
    return this._convertV1ToV2(snapshot.docs)
  }

  /**
   * Convert V1 snapshot docs to V2 format.
   * V1 docs use legacy `_id` with prefixes and camelCase fields.
   */
  private _convertV1ToV2(v1Docs: {tasks: any[]; tags: any[]; branches: any[]; files: any[]; settings: any | null}): SnapshotV2Docs {
    // Build a tag name→id lookup from v1 tags for resolving task tag references
    const tagNameToId = new Map<string, string>()
    const tags = (v1Docs.tags ?? []).map((t: any) => {
      const id = t._id ? t._id.split(":")[1] : t.id
      tagNameToId.set(t.name, id)
      return {
        id,
        name: t.name,
        color: t.color,
        created_at: t.createdAt ?? t.created_at,
        updated_at: t.updatedAt ?? t.updated_at,
        deleted_at: t.deletedAt ?? t.deleted_at ?? null,
      }
    })

    const tasks = (v1Docs.tasks ?? []).map((t: any) => {
      const id = t._id ? t._id.split(":")[1] : t.id
      // V1 task tags may be tag names — resolve to IDs
      const taskTags = (t.tags ?? []).map((ref: string) => tagNameToId.get(ref) ?? ref)
      return {
        id,
        status: t.status ?? "active",
        content: t.content ?? "",
        minimized: !!(t.minimized ?? false),
        order_index: t.orderIndex ?? t.order_index ?? Date.parse(t.createdAt ?? t.created_at ?? new Date().toISOString()),
        scheduled_date: t.scheduled?.date ?? t.scheduled_date ?? "",
        scheduled_time: t.scheduled?.time ?? t.scheduled_time ?? "",
        scheduled_timezone: t.scheduled?.timezone ?? t.scheduled_timezone ?? "",
        estimated_time: t.estimatedTime ?? t.estimated_time ?? 0,
        spent_time: t.spentTime ?? t.spent_time ?? 0,
        branch_id: t.branchId ?? t.branch_id ?? "main",
        tags: taskTags,
        attachments: t.attachments ?? [],
        created_at: t.createdAt ?? t.created_at,
        updated_at: t.updatedAt ?? t.updated_at,
        deleted_at: t.deletedAt ?? t.deleted_at ?? null,
      }
    })

    const branches = (v1Docs.branches ?? []).map((b: any) => ({
      id: b._id ? b._id.split(":")[1] : b.id,
      name: b.name,
      created_at: b.createdAt ?? b.created_at,
      updated_at: b.updatedAt ?? b.updated_at,
      deleted_at: b.deletedAt ?? b.deleted_at ?? null,
    }))

    const files = (v1Docs.files ?? []).map((f: any) => ({
      id: f._id ? f._id.split(":")[1] : f.id,
      name: f.name,
      mime_type: f.mimeType ?? f.mime_type,
      size: f.size,
      created_at: f.createdAt ?? f.created_at,
      updated_at: f.updatedAt ?? f.updated_at,
      deleted_at: f.deletedAt ?? f.deleted_at ?? null,
    }))

    let settings: SnapshotV2Docs["settings"] = null
    if (v1Docs.settings) {
      const s = v1Docs.settings
      settings = {
        id: "default",
        version: s.data?.version ?? s.version ?? "",
        data: typeof s.data === "string" ? s.data : JSON.stringify(s.data ?? {}),
        created_at: s.createdAt ?? s.created_at,
        updated_at: s.updatedAt ?? s.updated_at,
      }
    }

    return {tasks, tags, branches, files, settings}
  }

  /**
   * Pull phase: merge remote changes into local
   */
  private async _pull(
    localDocs: SnapshotV2Docs,
    remoteDocs: SnapshotV2Docs | null,
    strategy: SyncStrategy,
  ): Promise<{resultDocs: SnapshotV2Docs; hasChanges: boolean}> {
    logger.info(logger.CONTEXT.SYNC_PULL, "Pulling snapshot")

    if (!remoteDocs) {
      logger.debug(logger.CONTEXT.SYNC_PULL, "Remote snapshot not found")
      return {resultDocs: localDocs, hasChanges: false}
    }

    const mergeResult: MergeResult = mergeRemoteIntoLocal(localDocs, remoteDocs, strategy, APP_CONFIG.sync.garbageCollectionInterval)

    const {resultDocs, toUpsert, toRemove, changes} = mergeResult

    const hasUpserts = toUpsert.tasks.length || toUpsert.tags.length || toUpsert.branches.length || toUpsert.files.length || toUpsert.settings
    if (hasUpserts) {
      const totalUpserts =
        toUpsert.tasks.length + toUpsert.tags.length + toUpsert.branches.length + toUpsert.files.length + (toUpsert.settings ? 1 : 0)
      logger.debug(logger.CONTEXT.SYNC_PULL, `Upserting ${totalUpserts} documents`)
      await this.localStore.upsertDocs(toUpsert)
    }

    const hasRemovals = toRemove.tasks?.length || toRemove.tags?.length || toRemove.branches?.length || toRemove.files?.length
    if (hasRemovals) {
      const totalRemovals =
        (toRemove.tasks?.length ?? 0) + (toRemove.tags?.length ?? 0) + (toRemove.branches?.length ?? 0) + (toRemove.files?.length ?? 0)
      logger.debug(logger.CONTEXT.SYNC_PULL, `Deleting ${totalRemovals} documents`)
      await this.localStore.deleteDocs(toRemove)
    }

    logger.info(logger.CONTEXT.SYNC_PULL, `Pull result: ${changes} changes`)

    return {resultDocs, hasChanges: changes > 0}
  }

  /**
   * Push phase: send local changes to remote + sync assets
   */
  private async _push(localDocs: SnapshotV2Docs): Promise<void> {
    logger.info(logger.CONTEXT.SYNC_PUSH, "Pushing snapshot")

    const snapshot = buildSnapshot(localDocs)
    await this.remoteStore.saveSnapshot(snapshot)

    logger.info(logger.CONTEXT.SYNC_PUSH, `Pushed snapshot ${snapshot.meta.hash}`)

    // Sync file assets after push
    if (localDocs.files.length) {
      try {
        await this.remoteStore.syncAssets(fsPaths.assetsDir(), localDocs.files)
      } catch (error) {
        logger.warn(logger.CONTEXT.SYNC_PUSH, "Asset sync failed, will retry next cycle", error)
      }
    }
  }

  private _setStatus(status: SyncStatus): void {
    const prevStatus = this._syncStatus
    this._syncStatus = status
    this.onStatusChange(status, prevStatus)
  }

  private _shouldPush(localDocs: SnapshotV2Docs, remoteDocs: SnapshotV2Docs | null): boolean {
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
