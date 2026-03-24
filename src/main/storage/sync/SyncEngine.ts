import os from "node:os"

import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {AsyncMutex} from "@/utils/AsyncMutex"
import {createIntervalScheduler} from "@/utils/createIntervalScheduler"
import {logger} from "@/utils/logger"
import {computeDocsHash} from "@/utils/sync/snapshot/computeDocsHash"

import {AuditLogger} from "./AuditLogger"
import {DeltaPuller} from "./DeltaPuller"
import {DeltaPusher} from "./DeltaPusher"

import type {ILocalStorage, IRemoteStorage, Snapshot, SyncAuditEntry, SyncAuditOutcome, SyncConfig, SyncStrategy} from "@/types/sync"
import type {SyncStatus} from "@shared/types/storage"
import type {PullResult} from "./DeltaPuller"
import type {PushResult} from "./DeltaPusher"

export class SyncEngine {
  private _syncStatus: SyncStatus = "inactive"
  private _isSyncEnabled = false
  private _deviceId: string | null = null
  private mutex = new AsyncMutex()

  private onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
  private onDataChanged: () => void
  private onPendingCountChanged: (count: number) => void
  private autoSyncScheduler: ReturnType<typeof createIntervalScheduler>

  private deltaPusher: DeltaPusher
  private deltaPuller: DeltaPuller
  private auditLogger: AuditLogger

  constructor(
    private localStore: ILocalStorage,
    private remoteStore: IRemoteStorage,
    private config: SyncConfig,
    onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void,
    onDataChanged: () => void,
    onPendingCountChanged: (count: number) => void,
  ) {
    this.onStatusChange = onStatusChange
    this.onDataChanged = onDataChanged
    this.onPendingCountChanged = onPendingCountChanged

    this.deltaPusher = new DeltaPusher(localStore, remoteStore, config)
    this.deltaPuller = new DeltaPuller(localStore, remoteStore, config)
    this.auditLogger = new AuditLogger(localStore, config)

    this.autoSyncScheduler = createIntervalScheduler({
      intervalMs: config.remoteSyncInterval,
      onProcess: () => this.sync(),
    })
  }

  get syncStatus(): SyncStatus {
    return this._syncStatus
  }

  get deviceId(): string | null {
    return this._deviceId
  }

  async enableAutoSync(): Promise<void> {
    if (this._isSyncEnabled) return

    this._deviceId = await this.localStore.getDeviceId()
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

  async getAuditLog(limit?: number): Promise<SyncAuditEntry[]> {
    return this.auditLogger.getLog(limit)
  }

  async getPendingChangesCount(): Promise<number> {
    const changes = await this.localStore.getUnsyncedChanges()
    return changes.length
  }

  async compactBaseline(): Promise<void> {
    const allDocs = await this.localStore.loadAllDocs()
    const hash = computeDocsHash(allDocs)

    const manifests = await this.remoteStore.listDeviceManifests()

    logger.info(
      logger.CONTEXT.SYNC_ENGINE,
      `[COMPACT] starting — ${manifests.length} devices, docs: tasks=${allDocs.tasks.length} tags=${allDocs.tags.length} branches=${allDocs.branches.length} files=${allDocs.files.length}`,
    )

    // Compute safe watermarks: only prune deltas that ALL devices have consumed.
    // For each device's deltas, the safe watermark is the MINIMUM cursor across all OTHER devices.
    const safeWatermarks: Record<string, number> = {}

    for (const source of manifests) {
      let minCursor = source.last_sequence // Start with max (all consumed)

      for (const consumer of manifests) {
        if (consumer.device_id === source.device_id) continue
        const cursor = consumer.cursors[source.device_id] ?? 0
        logger.info(
          logger.CONTEXT.SYNC_ENGINE,
          `[COMPACT] ${consumer.device_id.slice(0, 8)} cursor for ${source.device_id.slice(0, 8)}: ${cursor} (source last_seq=${source.last_sequence})`,
        )
        if (cursor < minCursor) minCursor = cursor
      }

      safeWatermarks[source.device_id] = minCursor
    }

    logger.info(logger.CONTEXT.SYNC_ENGINE, "[COMPACT] safe watermarks (min cursor per source device)", safeWatermarks)

    const baseline: Snapshot = {
      version: 3,
      docs: allDocs,
      meta: {
        created_at: new Date().toISOString(),
        hash,
        watermarks: safeWatermarks,
      },
    }

    await this.remoteStore.saveBaseline(baseline)

    const pruned = await this.remoteStore.pruneDeltas(safeWatermarks)
    logger.info(logger.CONTEXT.SYNC_ENGINE, `[COMPACT] done — baseline saved, ${pruned} delta files pruned`)
  }

  private async _sync(strategy: SyncStrategy = "pull"): Promise<void> {
    if (!this._isSyncEnabled) return

    const startedAt = new Date().toISOString()
    const deviceId = this._deviceId ?? (await this.localStore.getDeviceId())
    const deviceName = os.hostname()

    let pushResult: PushResult | undefined
    let pullResult: PullResult | undefined
    let outcome: SyncAuditOutcome = "success"
    let errorMessage: string | null = null

    try {
      logger.info(logger.CONTEXT.SYNC_ENGINE, `[SYNC] ═══ START ═══ device=${deviceId} strategy=${strategy}`)

      // PUSH
      pushResult = await this.deltaPusher.pushDeltas(deviceId, deviceName)
      if (pushResult.error) {
        outcome = "partial"
        errorMessage = pushResult.error
      }

      // PULL
      pullResult = await this.deltaPuller.pullDeltas(deviceId, strategy)
      if (pullResult.error) {
        outcome = "partial"
        errorMessage = pullResult.error
      }

      // Fire data changed if pull applied changes
      if (pullResult.has_changes) {
        this.onDataChanged()
      }

      // Broadcast pending count
      const pendingCount = await this.getPendingChangesCount()
      this.onPendingCountChanged(pendingCount)

      // Check if no work was done
      if (pushResult.deltas_pushed === 0 && pullResult.deltas_pulled === 0 && outcome === "success") {
        outcome = "no_changes"
      }

      logger.info(
        logger.CONTEXT.SYNC_ENGINE,
        `[SYNC] ═══ END ═══ pushed=${pushResult.deltas_pushed} pulled=${pullResult.deltas_pulled} upserted=${pullResult.docs_upserted} outcome=${outcome}`,
      )

      // Sync assets
      try {
        const allDocs = await this.localStore.loadAllDocs()
        if (allDocs.files.length) {
          const {fsPaths} = await import("@/config")
          await this.remoteStore.syncAssets(fsPaths.assetsDir(), allDocs.files)
        }
      } catch (err) {
        logger.warn(logger.CONTEXT.SYNC_ENGINE, "Asset sync failed, will retry next cycle", err)
      }
    } catch (error) {
      outcome = "error"
      errorMessage = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      const completedAt = new Date().toISOString()
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()

      try {
        await this.auditLogger.writeEntry({
          started_at: startedAt,
          completed_at: completedAt,
          duration_ms: durationMs,
          strategy,
          outcome,
          deltas_pushed: pushResult?.deltas_pushed ?? 0,
          deltas_pulled: pullResult?.deltas_pulled ?? 0,
          conflicts_resolved: pullResult?.conflict_count ?? 0,
          docs_upserted: pullResult?.docs_upserted ?? 0,
          docs_deleted: pullResult?.docs_deleted ?? 0,
          error_message: errorMessage,
          device_id: deviceId,
        })

        await this.auditLogger.prune()
        await this._checkCompaction()
      } catch (err) {
        logger.warn(logger.CONTEXT.SYNC_ENGINE, "Post-sync audit/compaction failed", err)
      }
    }
  }

  private async _checkCompaction(): Promise<void> {
    try {
      const manifests = await this.remoteStore.listDeviceManifests()

      // Only compact if there are 2+ devices (otherwise no pruning benefit)
      if (manifests.length < 2) {
        logger.info(logger.CONTEXT.SYNC_ENGINE, `[COMPACT_CHECK] skip — only ${manifests.length} device(s)`)
        return
      }

      // Sum up last_sequences as rough delta count approximation
      let totalDeltaFiles = 0
      for (const m of manifests) {
        totalDeltaFiles += m.last_sequence
      }
      if (totalDeltaFiles <= this.config.compactionThreshold) {
        logger.info(logger.CONTEXT.SYNC_ENGINE, `[COMPACT_CHECK] skip — total=${totalDeltaFiles} <= threshold=${this.config.compactionThreshold}`)
        return
      }

      // Safety check: only compact if ALL devices have consumed each other's deltas.
      // If any device has cursor=0 for another device, it hasn't synced yet — don't prune.
      for (const source of manifests) {
        for (const consumer of manifests) {
          if (consumer.device_id === source.device_id) continue
          const cursor = consumer.cursors[source.device_id] ?? 0
          if (cursor === 0 && source.last_sequence > 0) {
            logger.info(
              logger.CONTEXT.SYNC_ENGINE,
              `[COMPACT_CHECK] BLOCKED — ${consumer.device_id.slice(0, 8)} hasn't consumed any deltas from ${source.device_id.slice(0, 8)} (cursor=0, last_seq=${source.last_sequence})`,
            )
            return
          }
        }
      }

      logger.info(logger.CONTEXT.SYNC_ENGINE, `[COMPACT_CHECK] proceeding — total=${totalDeltaFiles}, all cursors > 0`)
      await this.compactBaseline()
    } catch (err) {
      logger.warn(logger.CONTEXT.SYNC_ENGINE, "Compaction check failed", err)
    }
  }

  private _setStatus(status: SyncStatus): void {
    const prevStatus = this._syncStatus
    this._syncStatus = status
    this.onStatusChange(status, prevStatus)
  }
}
