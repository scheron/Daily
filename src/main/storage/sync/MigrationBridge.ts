import {logger} from "@/utils/logger"
import {mergeRemoteIntoLocal} from "@/utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshotMeta} from "@/utils/sync/snapshot/buildSnapshot"

import type {ILocalStorage, IRemoteStorage, SnapshotV3, SyncStrategy} from "@/types/sync"

export class MigrationBridge {
  constructor(
    private localStore: ILocalStorage,
    private remoteStore: IRemoteStorage,
  ) {}

  async needsMigration(): Promise<boolean> {
    const baseline = await this.remoteStore.loadBaseline()
    if (baseline) return false

    const legacy = await this.remoteStore.loadLegacySnapshot()
    return legacy !== null
  }

  async migrate(deviceId: string, deviceName: string): Promise<void> {
    logger.info(logger.CONTEXT.SYNC_ENGINE, "Starting v2 → v3 migration")

    const legacySnapshot = await this.remoteStore.loadLegacySnapshot()
    if (!legacySnapshot) return

    // Import v2 docs into local using existing merge
    const localDocs = await this.localStore.loadAllDocs()
    const mergeResult = mergeRemoteIntoLocal(localDocs, legacySnapshot.docs, "pull", 7 * 24 * 60 * 60 * 1000)

    if (
      mergeResult.toUpsert.tasks.length ||
      mergeResult.toUpsert.tags.length ||
      mergeResult.toUpsert.branches.length ||
      mergeResult.toUpsert.files.length ||
      mergeResult.toUpsert.settings
    ) {
      await this.localStore.upsertDocs(mergeResult.toUpsert)
    }

    // Build v3 baseline from merged state
    const allDocs = await this.localStore.loadAllDocs()
    const meta = buildSnapshotMeta(allDocs)

    const baseline: SnapshotV3 = {
      version: 3,
      docs: allDocs,
      meta: {
        created_at: new Date().toISOString(),
        hash: meta.hash,
        watermarks: {},
      },
    }

    await this.remoteStore.saveBaseline(baseline)

    // Create initial device manifest
    await this.remoteStore.saveDeviceManifest({
      version: 3,
      device_id: deviceId,
      device_name: deviceName,
      last_sequence: 0,
      last_written_at: new Date().toISOString(),
      cursors: {},
    })

    // Delete legacy snapshot (non-fatal)
    try {
      await this.remoteStore.deleteLegacySnapshot()
    } catch (err) {
      logger.warn(logger.CONTEXT.SYNC_ENGINE, "Failed to delete legacy snapshot", err)
    }

    logger.info(logger.CONTEXT.SYNC_ENGINE, "v2 → v3 migration complete")
  }

  async needsBootstrap(): Promise<boolean> {
    const baseline = await this.remoteStore.loadBaseline()
    if (!baseline) return false

    const localDocs = await this.localStore.loadAllDocs()
    const isEmpty = localDocs.tasks.length === 0 && localDocs.tags.length === 0 && localDocs.files.length === 0
    return isEmpty
  }

  async bootstrap(deviceId: string, deviceName: string, _strategy: SyncStrategy): Promise<void> {
    logger.info(logger.CONTEXT.SYNC_ENGINE, "Bootstrapping from v3 baseline")

    const baseline = await this.remoteStore.loadBaseline()
    if (!baseline) return

    await this.localStore.upsertDocs(baseline.docs)

    // Create device manifest
    await this.remoteStore.saveDeviceManifest({
      version: 3,
      device_id: deviceId,
      device_name: deviceName,
      last_sequence: 0,
      last_written_at: new Date().toISOString(),
      cursors: Object.fromEntries(Object.entries(baseline.meta.watermarks).map(([k, v]) => [k, v])),
    })

    logger.info(logger.CONTEXT.SYNC_ENGINE, "Bootstrap complete")
  }
}
