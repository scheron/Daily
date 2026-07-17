import {extname, join, resolve, sep} from "path"
import fs from "fs-extra"

import {RemoteSnapshotPendingError} from "@shared/errors/sync/RemoteSnapshotPendingError"
import {SnapshotVersionAheadError} from "@shared/errors/sync/SnapshotVersionAheadError"
import {SyncErrorCode} from "@shared/errors/sync/SyncErrorCode"
import {sleep} from "@shared/utils/common/sleep"
import {coordinatedRead, coordinatedWrite, getICloudStubPath, hasICloudStub, requestDownloadAndWait} from "@/utils/fileCoordinator"
import {logger} from "@/utils/logger"
import {assertKnownSnapshotVersion} from "@/utils/sync/snapshot/assertKnownSnapshotVersion"
import {isValidSnapshot} from "@/utils/sync/snapshot/isValidSnapshot"

import type {IRemoteStorage, Snapshot, SnapshotFile} from "@/types/sync"

const SNAPSHOT_FILENAME = "snapshot.json"
const MAX_RETRIES = 3
const RETRY_DELAYS = [500, 1000, 2000]

export class RemoteStorageAdapter implements IRemoteStorage {
  private readonly syncDir: string
  private readonly snapshotPath: string

  constructor(syncDir: string) {
    this.syncDir = syncDir
    this.snapshotPath = join(this.syncDir, SNAPSHOT_FILENAME)
  }

  async loadSnapshot(): Promise<Snapshot | null> {
    if (await hasICloudStub(this.snapshotPath)) {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Snapshot file is an iCloud stub, requesting download")
      const isReady = await requestDownloadAndWait(this.snapshotPath)
      if (!isReady) {
        throw new RemoteSnapshotPendingError()
      }
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const buffer = await coordinatedRead(this.snapshotPath)
        if (!buffer) return null

        const parsed = JSON.parse(buffer.toString("utf-8"))
        assertKnownSnapshotVersion(parsed)

        if (!isValidSnapshot(parsed)) {
          logger.warn(logger.CONTEXT.SYNC_REMOTE, "Invalid snapshot structure, treating as empty")
          return null
        }

        /* Old snapshots (v2) may omit docs.branches / docs.events; normalize for downstream code. */
        if (parsed.docs) {
          parsed.docs.branches = parsed.docs.branches ?? []
          parsed.docs.events = parsed.docs.events ?? []
        }

        return parsed as Snapshot
      } catch (err: any) {
        if (err instanceof RemoteSnapshotPendingError || err instanceof SnapshotVersionAheadError) {
          throw err
        }

        if (attempt < MAX_RETRIES - 1) {
          if (await hasICloudStub(this.snapshotPath)) {
            const isReady = await requestDownloadAndWait(this.snapshotPath)
            if (!isReady) {
              throw new RemoteSnapshotPendingError()
            }
          }
          logger.warn(
            logger.CONTEXT.SYNC_REMOTE,
            `Failed to read snapshot (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${RETRY_DELAYS[attempt]}ms`,
          )
          await sleep(RETRY_DELAYS[attempt])
        } else {
          logger.error(logger.CONTEXT.SYNC_REMOTE, `Failed to read snapshot after ${MAX_RETRIES} attempts`, err)
          throw new Error(`${SyncErrorCode.SnapshotLoadFailed} after ${MAX_RETRIES} attempts: ${err.message}`)
        }
      }
    }

    return null
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    await this.ensureDir()

    const data = Buffer.from(JSON.stringify(snapshot, null, 2), "utf-8")
    await coordinatedWrite(this.snapshotPath, data)
  }

  async syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void> {
    const remoteAssetsDir = join(this.syncDir, "assets")
    await fs.ensureDir(remoteAssetsDir)

    const localRoot = resolve(localAssetsDir) + sep
    const remoteRoot = resolve(remoteAssetsDir) + sep

    for (const file of fileManifest) {
      const ext = extname(file.name).slice(1) || "bin"
      const filename = `${file.id}.${ext}`
      const localPath = join(localAssetsDir, filename)
      const remotePath = join(remoteAssetsDir, filename)

      if (!resolve(localPath).startsWith(localRoot) || !resolve(remotePath).startsWith(remoteRoot)) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Skipping asset with suspicious path: ${filename}`)
        continue
      }

      try {
        const localExists = await fs.pathExists(localPath)
        const remoteExists = await fs.pathExists(remotePath)

        const remoteStubPath = getICloudStubPath(remotePath)
        const remoteIsStub = await hasICloudStub(remotePath)

        /* If both sides already have the file, skip (no binary comparison). */
        if (localExists && !remoteExists && !remoteIsStub) {
          const buffer = await fs.readFile(localPath)
          await coordinatedWrite(remotePath, buffer)
        } else if ((remoteExists || remoteIsStub) && !localExists) {
          if (remoteIsStub) {
            const isReady = await requestDownloadAndWait(remotePath, {timeoutMs: 10_000})
            if (!isReady) {
              logger.info(logger.CONTEXT.SYNC_REMOTE, `Asset is still downloading from iCloud, skipping for now: ${remoteStubPath}`)
              continue
            }
          }

          const buffer = await coordinatedRead(remotePath)
          if (buffer) {
            await fs.writeFile(localPath, buffer)
          }
        }
      } catch (err) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Failed to sync asset ${filename}`, err)
      }
    }
  }

  private async ensureDir(): Promise<void> {
    await fs.ensureDir(this.syncDir)
  }
}
