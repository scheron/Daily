import {extname, join} from "path"
import fs from "fs-extra"

import {coordinatedRead, coordinatedWrite, isICloudStub, requestDownload} from "@/utils/fileCoordinator"
import {logger} from "@/utils/logger"
import {isValidSnapshot} from "@/utils/sync/snapshot/isValidSnapshot"

import type {IRemoteStorage, Snapshot, SnapshotFile, SnapshotV2} from "@/types/sync"

const SNAPSHOT_FILENAME = "snapshot.v2.json"
const MAX_RETRIES = 3
const RETRY_DELAYS = [500, 1000, 2000]

export class RemoteStorageAdapter implements IRemoteStorage {
  private readonly syncDir: string
  private readonly snapshotPath: string

  constructor(syncDir: string) {
    this.syncDir = syncDir
    this.snapshotPath = join(this.syncDir, SNAPSHOT_FILENAME)
  }

  private async ensureDir(): Promise<void> {
    await fs.ensureDir(this.syncDir)
  }

  async loadSnapshot(): Promise<Snapshot | null> {
    // Check for .icloud stub and request download
    const stubPath = join(this.syncDir, `.${SNAPSHOT_FILENAME}.icloud`)
    if (await fs.pathExists(stubPath)) {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Snapshot file is an iCloud stub, requesting download")
      await requestDownload(stubPath)
      return null
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const buffer = await coordinatedRead(this.snapshotPath)
        if (!buffer) return null

        const parsed = JSON.parse(buffer.toString("utf-8"))

        if (!isValidSnapshot(parsed)) {
          logger.warn(logger.CONTEXT.SYNC_REMOTE, "Invalid snapshot structure, treating as empty")
          return null
        }

        // Ensure branches array exists (backward compat)
        if (parsed.docs) {
          parsed.docs.branches = parsed.docs.branches ?? []
        }

        return parsed as Snapshot
      } catch (err: any) {
        if (attempt < MAX_RETRIES - 1) {
          // Check if file became an iCloud stub during retry
          if (isICloudStub(this.snapshotPath) || (await fs.pathExists(stubPath))) {
            await requestDownload(stubPath)
          }
          logger.warn(
            logger.CONTEXT.SYNC_REMOTE,
            `Failed to read snapshot (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${RETRY_DELAYS[attempt]}ms`,
          )
          await sleep(RETRY_DELAYS[attempt])
        } else {
          logger.error(logger.CONTEXT.SYNC_REMOTE, `Failed to read snapshot after ${MAX_RETRIES} attempts`, err)
          throw new Error(`Failed to load snapshot after ${MAX_RETRIES} attempts: ${err.message}`)
        }
      }
    }

    return null
  }

  async saveSnapshot(snapshot: SnapshotV2): Promise<void> {
    await this.ensureDir()

    const data = Buffer.from(JSON.stringify(snapshot, null, 2), "utf-8")
    await coordinatedWrite(this.snapshotPath, data)
  }

  async syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void> {
    const remoteAssetsDir = join(this.syncDir, "assets")
    await fs.ensureDir(remoteAssetsDir)

    for (const file of fileManifest) {
      const ext = extname(file.name).slice(1) || "bin"
      const filename = `${file.id}.${ext}`
      const localPath = join(localAssetsDir, filename)
      const remotePath = join(remoteAssetsDir, filename)

      try {
        const localExists = await fs.pathExists(localPath)
        const remoteExists = await fs.pathExists(remotePath)

        // Check for .icloud stub on remote
        const remoteStubPath = join(remoteAssetsDir, `.${filename}.icloud`)
        const remoteIsStub = await fs.pathExists(remoteStubPath)

        if (localExists && !remoteExists && !remoteIsStub) {
          // Push: local -> remote (coordinated write for iCloud path)
          const buffer = await fs.readFile(localPath)
          await coordinatedWrite(remotePath, buffer)
        } else if ((remoteExists || remoteIsStub) && !localExists) {
          // Pull: remote -> local
          if (remoteIsStub) {
            await requestDownload(remoteStubPath)
            // File not available yet, will sync on next cycle
          } else {
            const buffer = await coordinatedRead(remotePath)
            if (buffer) {
              await fs.writeFile(localPath, buffer)
            }
          }
        }
        // Both exist: skip (presence check only, no content comparison)
      } catch (err) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Failed to sync asset ${filename}`, err)
        // Don't abort - continue with next file
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
