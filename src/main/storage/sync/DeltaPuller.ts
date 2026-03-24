import {logger} from "@/utils/logger"
import {mergeFields} from "@/utils/sync/merge/FieldMerger"

import type {DeltaRecord, FieldConflict, ILocalStorage, IRemoteStorage, SyncConfig, SyncStrategy} from "@/types/sync"

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
}
