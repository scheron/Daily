import {logger} from "@/utils/logger"

import type {ChangeLogEntry, DeltaFile, DeltaRecord, ILocalStorage, IRemoteStorage, SyncConfig} from "@/types/sync"

export type PushResult = {
  deltas_pushed: number
  last_sequence: number
  error: string | null
}

export class DeltaPusher {
  constructor(
    private localStore: ILocalStorage,
    private remoteStore: IRemoteStorage,
    private config: SyncConfig,
  ) {}

  async pushDeltas(deviceId: string, deviceName: string): Promise<PushResult> {
    try {
      const unsynced = await this.localStore.getUnsyncedChanges()

      logger.info(logger.CONTEXT.SYNC_PUSH, `[PUSH] device=${deviceId} unsynced_changes=${unsynced.length}`)

      if (unsynced.length === 0) {
        return {deltas_pushed: 0, last_sequence: 0, error: null}
      }

      const seqRange = `${unsynced[0].sequence}-${unsynced[unsynced.length - 1].sequence}`
      const entities = new Map<string, number>()
      for (const e of unsynced) {
        entities.set(`${e.entity}:${e.doc_id}`, (entities.get(`${e.entity}:${e.doc_id}`) ?? 0) + 1)
      }
      logger.info(logger.CONTEXT.SYNC_PUSH, `[PUSH] seq_range=${seqRange} unique_docs=${entities.size}`, Object.fromEntries(entities))

      // Split into chunks
      const chunks: ChangeLogEntry[][] = []
      for (let i = 0; i < unsynced.length; i += this.config.maxDeltasPerFile) {
        chunks.push(unsynced.slice(i, i + this.config.maxDeltasPerFile))
      }

      let lastSequence = 0

      for (const chunk of chunks) {
        const deltas: DeltaRecord[] = chunk.map((entry) => ({
          doc_id: entry.doc_id,
          entity: entry.entity,
          operation: entry.operation,
          field_name: entry.field_name,
          old_value: entry.old_value,
          new_value: entry.new_value,
          changed_at: entry.changed_at,
          sequence: entry.sequence,
          device_id: entry.device_id,
        }))

        const deltaFile: DeltaFile = {
          version: 3,
          device_id: deviceId,
          sequence_from: chunk[0].sequence,
          sequence_to: chunk[chunk.length - 1].sequence,
          created_at: new Date().toISOString(),
          deltas,
        }

        await this.remoteStore.saveDeltaFile(deltaFile)
        logger.info(
          logger.CONTEXT.SYNC_PUSH,
          `[PUSH] wrote delta file seq=${deltaFile.sequence_from}-${deltaFile.sequence_to} deltas=${deltas.length}`,
        )
        lastSequence = chunk[chunk.length - 1].sequence
      }

      // Update device manifest
      const existingManifest = await this.remoteStore.loadDeviceManifest(deviceId)
      const manifest = existingManifest ?? {
        version: 3 as const,
        device_id: deviceId,
        device_name: deviceName,
        last_sequence: 0,
        last_written_at: "",
        cursors: {},
      }

      manifest.last_sequence = lastSequence
      manifest.last_written_at = new Date().toISOString()
      manifest.device_name = deviceName

      await this.remoteStore.saveDeviceManifest(manifest)
      logger.info(logger.CONTEXT.SYNC_PUSH, `[PUSH] manifest saved last_sequence=${lastSequence}`)

      // Mark changes as synced
      await this.localStore.markChangesSynced(lastSequence)

      logger.info(logger.CONTEXT.SYNC_PUSH, `[PUSH] done deltas_pushed=${unsynced.length} last_sequence=${lastSequence}`)
      return {deltas_pushed: unsynced.length, last_sequence: lastSequence, error: null}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.SYNC_REMOTE, "DeltaPusher failed", err)
      return {deltas_pushed: 0, last_sequence: 0, error: message}
    }
  }
}
