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

      // Collect deltas from all remote devices
      const allRemoteDeltas: DeltaRecord[] = []

      for (const manifest of remoteManifests) {
        if (manifest.device_id === deviceId) continue // Skip self

        const cursor = cursors[manifest.device_id] ?? 0
        if (manifest.last_sequence <= cursor) continue // No new deltas

        const deltas = await this.remoteStore.loadDeltas(manifest.device_id, cursor)
        allRemoteDeltas.push(...deltas)
      }

      if (allRemoteDeltas.length === 0) {
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

      for (const manifest of remoteManifests) {
        if (manifest.device_id === deviceId) continue
        updatedManifest.cursors[manifest.device_id] = manifest.last_sequence
      }

      await this.remoteStore.saveDeviceManifest(updatedManifest)

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
