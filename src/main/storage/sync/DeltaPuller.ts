import {logger} from "@/utils/logger"
import {mergeFields} from "@/utils/sync/merge/FieldMerger"

import type {DeltaRecord, DeviceManifest, FieldConflict, ILocalStorage, IRemoteStorage, SyncConfig, SyncStrategy} from "@/types/sync"

export type PullResult = {
  deltas_pulled: number
  docs_upserted: number
  docs_deleted: number
  conflicts: FieldConflict[]
  conflict_count: number
  has_changes: boolean
  error: string | null
}

export class DeltaPuller {
  constructor(
    private localStore: ILocalStorage,
    private remoteStore: IRemoteStorage,
    private config: SyncConfig,
  ) {}

  async pullDeltas(deviceId: string, strategy: SyncStrategy): Promise<PullResult> {
    try {
      // Load all remote device manifests
      const remoteManifests = await this.remoteStore.listDeviceManifests()

      // Load own manifest for cursors
      const ownManifest = await this.remoteStore.loadDeviceManifest(deviceId)
      const cursors = ownManifest?.cursors ?? {}

      logger.info(logger.CONTEXT.SYNC_PULL, `[PULL] device=${deviceId} remote_manifests=${remoteManifests.length} own_cursors=`, cursors)

      // Collect deltas from all remote devices
      const allRemoteDeltas: DeltaRecord[] = []

      for (const manifest of remoteManifests) {
        if (manifest.device_id === deviceId) continue // Skip self

        const cursor = cursors[manifest.device_id] ?? 0
        if (manifest.last_sequence <= cursor) {
          logger.info(logger.CONTEXT.SYNC_PULL, `[PULL] skip ${manifest.device_id} (last_seq=${manifest.last_sequence} <= cursor=${cursor})`)
          continue // No new deltas
        }

        logger.info(
          logger.CONTEXT.SYNC_PULL,
          `[PULL] loading deltas from ${manifest.device_id} after_seq=${cursor} manifest_last_seq=${manifest.last_sequence}`,
        )
        const deltas = await this.remoteStore.loadDeltas(manifest.device_id, cursor)
        logger.info(logger.CONTEXT.SYNC_PULL, `[PULL] loaded ${deltas.length} deltas from ${manifest.device_id}`, {
          seq_range: deltas.length > 0 ? `${deltas[0].sequence}-${deltas[deltas.length - 1].sequence}` : "empty",
          unique_docs: new Set(deltas.map((d) => d.doc_id)).size,
        })
        allRemoteDeltas.push(...deltas)
      }

      if (allRemoteDeltas.length === 0) {
        // Check if we expected deltas but got none (delta files were pruned by compaction)
        const hasMissingDeltas = remoteManifests.some((m) => {
          if (m.device_id === deviceId) return false
          const cursor = cursors[m.device_id] ?? 0
          return m.last_sequence > cursor
        })

        if (hasMissingDeltas) {
          // Delta files were pruned — fall back to baseline snapshot
          logger.warn(logger.CONTEXT.SYNC_PULL, `[PULL] expected deltas but found none — attempting baseline restore`)
          const restoreResult = await this._restoreFromBaseline(deviceId, remoteManifests, ownManifest)
          if (restoreResult) return restoreResult
        }

        logger.info(logger.CONTEXT.SYNC_PULL, `[PULL] no deltas to apply`)
        return {deltas_pulled: 0, docs_upserted: 0, docs_deleted: 0, conflicts: [], conflict_count: 0, has_changes: false, error: null}
      }

      // Load local unsynced changes for conflict detection
      const localChanges = await this.localStore.getUnsyncedChanges()

      // Run field merger for conflict reporting
      const mergeResult = mergeFields(localChanges, allRemoteDeltas, strategy)

      // Apply remote deltas to local
      const applyResult = await this.localStore.applyRemoteDeltas(allRemoteDeltas, strategy)

      // Update cursors in own manifest
      const updatedManifest = ownManifest ?? {
        version: 3 as const,
        device_id: deviceId,
        device_name: "",
        last_sequence: 0,
        last_written_at: "",
        cursors: {},
      }

      // Advance cursors only for deltas we actually processed (not skipped iCloud stubs)
      const actualCursors: Record<string, number> = {}
      for (const delta of allRemoteDeltas) {
        const prev = actualCursors[delta.device_id] ?? 0
        if (delta.sequence > prev) actualCursors[delta.device_id] = delta.sequence
      }

      for (const [remoteDeviceId, maxSeq] of Object.entries(actualCursors)) {
        const prevCursor = updatedManifest.cursors[remoteDeviceId] ?? 0
        logger.info(logger.CONTEXT.SYNC_PULL, `[PULL] cursor ${remoteDeviceId}: ${prevCursor} → ${maxSeq}`)
        updatedManifest.cursors[remoteDeviceId] = maxSeq
      }

      await this.remoteStore.saveDeviceManifest(updatedManifest)

      logger.info(
        logger.CONTEXT.SYNC_PULL,
        `[PULL] done deltas=${allRemoteDeltas.length} upserted=${applyResult.docs_upserted} deleted=${applyResult.docs_deleted} conflicts=${mergeResult.conflicts.length}`,
      )

      return {
        deltas_pulled: allRemoteDeltas.length,
        docs_upserted: applyResult.docs_upserted,
        docs_deleted: applyResult.docs_deleted,
        conflicts: mergeResult.conflicts,
        conflict_count: mergeResult.conflicts.length,
        has_changes: true,
        error: null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.SYNC_REMOTE, "DeltaPuller failed", err)
      return {deltas_pulled: 0, docs_upserted: 0, docs_deleted: 0, conflicts: [], conflict_count: 0, has_changes: false, error: message}
    }
  }

  private async _restoreFromBaseline(
    deviceId: string,
    remoteManifests: DeviceManifest[],
    ownManifest: DeviceManifest | null,
  ): Promise<PullResult | null> {
    try {
      const baseline = await this.remoteStore.loadBaseline()
      if (!baseline?.docs) {
        logger.warn(logger.CONTEXT.SYNC_PULL, `[BASELINE] no baseline snapshot found`)
        return null
      }

      logger.info(logger.CONTEXT.SYNC_PULL, `[BASELINE] restoring from baseline`, {
        tasks: baseline.docs.tasks.length,
        tags: baseline.docs.tags.length,
        branches: baseline.docs.branches.length,
        files: baseline.docs.files.length,
      })

      const result = await this.localStore.restoreFromBaseline(baseline.docs)

      logger.info(logger.CONTEXT.SYNC_PULL, `[BASELINE] restored`, result)

      const totalRestored = result.tasks + result.tags + result.branches + result.files

      // Update cursors to match baseline watermarks so we don't try to re-pull pruned deltas
      const updatedManifest = ownManifest ?? {
        version: 3 as const,
        device_id: deviceId,
        device_name: "",
        last_sequence: 0,
        last_written_at: "",
        cursors: {},
      }

      if (baseline.meta?.watermarks) {
        for (const [remoteDeviceId, watermark] of Object.entries(baseline.meta.watermarks)) {
          if (remoteDeviceId === deviceId) continue
          const currentCursor = updatedManifest.cursors[remoteDeviceId] ?? 0
          if (watermark > currentCursor) {
            logger.info(logger.CONTEXT.SYNC_PULL, `[BASELINE] cursor ${remoteDeviceId}: ${currentCursor} → ${watermark} (from baseline watermarks)`)
            updatedManifest.cursors[remoteDeviceId] = watermark
          }
        }
      } else {
        // No watermarks in baseline — advance cursors to manifest.last_sequence to prevent re-pull attempts
        for (const manifest of remoteManifests) {
          if (manifest.device_id === deviceId) continue
          updatedManifest.cursors[manifest.device_id] = manifest.last_sequence
        }
      }

      await this.remoteStore.saveDeviceManifest(updatedManifest)

      return {
        deltas_pulled: 0,
        docs_upserted: totalRestored,
        docs_deleted: 0,
        conflicts: [],
        conflict_count: 0,
        has_changes: totalRestored > 0,
        error: null,
      }
    } catch (err) {
      logger.error(logger.CONTEXT.SYNC_PULL, "[BASELINE] restore failed", err)
      return null
    }
  }
}
