import {extname, join, resolve, sep} from "node:path"
import fs from "fs-extra"

import {ProtocolError, ProtocolErrorCode, RemoteWriteConflictError, SnapshotVersionAheadError} from "@daily/protocol"

import {logger} from "../../../utils/logger"
import {assertKnownSnapshotVersion} from "../../../utils/sync/snapshot/assertKnownSnapshotVersion"
import {isValidSnapshot} from "../../../utils/sync/snapshot/isValidSnapshot"
import {DailySyncClient} from "../server/DailySyncClient"

import type {IRevisionedRemoteStorage, RemoteReadResult, ServerSyncBinding, Snapshot, SnapshotFile, SnapshotRevision} from "@daily/protocol"

/**
 * IRevisionedRemoteStorage over a Daily Sync Server this device has bound itself to. The server
 * has no unconditional write, so every push is a compare-and-swap against the revision the
 * snapshot was read at, and a lost race surfaces as `RemoteWriteConflictError` for `SyncEngine`
 * to retry.
 */
export class DailyServerRemoteAdapter implements IRevisionedRemoteStorage {
  readonly supportsRevisions = true as const

  private readonly client: DailySyncClient

  constructor(binding: ServerSyncBinding) {
    this.client = new DailySyncClient({baseUrl: binding.baseUrl, token: binding.token, fingerprint: binding.fingerprint})
  }

  async loadSnapshot(): Promise<Snapshot | null> {
    const {snapshot} = await this.loadSnapshotWithRevision()
    return snapshot
  }

  async loadSnapshotWithRevision(): Promise<RemoteReadResult> {
    const {snapshot: parsed, revision} = await this.client.readSnapshot()
    if (parsed === null || parsed === undefined) return {snapshot: null, revision: revision ?? null}

    assertKnownSnapshotVersion(parsed)

    if (!isValidSnapshot(parsed as Snapshot)) {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Invalid snapshot structure, treating as empty")
      return {snapshot: null, revision: revision ?? null}
    }

    const snapshot = parsed as Snapshot
    snapshot.docs.branches = snapshot.docs.branches ?? []
    snapshot.docs.events = snapshot.docs.events ?? []
    return {snapshot, revision: revision ?? null}
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    const {revision} = await this.loadSnapshotWithRevision()
    await this.saveSnapshotIfUnchanged(snapshot, revision)
  }

  async saveSnapshotIfUnchanged(snapshot: Snapshot, expectedRevision: SnapshotRevision | null): Promise<SnapshotRevision> {
    try {
      const {revision} = await this.client.writeSnapshot(snapshot, expectedRevision)
      return revision
    } catch (err) {
      if (err instanceof ProtocolError && err.code === ProtocolErrorCode.REVISION_CONFLICT) {
        throw new RemoteWriteConflictError(`Server rejected the write at revision ${expectedRevision ?? "none"}`)
      }

      if (err instanceof ProtocolError && err.code === ProtocolErrorCode.SNAPSHOT_VERSION_BEHIND) {
        throw new SnapshotVersionAheadError(snapshot.version + 1)
      }

      throw err
    }
  }

  async syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void> {
    if (!fileManifest.length) return

    await fs.ensureDir(localAssetsDir)

    const localRoot = resolve(localAssetsDir) + sep
    const remoteNames = new Set((await this.client.listAssets()).map((asset) => asset.name))

    for (const file of fileManifest) {
      const ext = extname(file.name).slice(1) || "bin"
      const filename = `${file.id}.${ext}`
      const localPath = join(localAssetsDir, filename)

      if (!resolve(localPath).startsWith(localRoot)) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Skipping asset with suspicious path: ${filename}`)
        continue
      }

      try {
        const localExists = await fs.pathExists(localPath)
        const remoteExists = remoteNames.has(filename)

        if (localExists && !remoteExists) {
          await this.client.uploadAsset(filename, await fs.readFile(localPath))
        } else if (remoteExists && !localExists) {
          await fs.writeFile(localPath, await this.client.downloadAsset(filename))
        }
      } catch (err) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Failed to sync asset ${filename}`, err)
      }
    }
  }
}
