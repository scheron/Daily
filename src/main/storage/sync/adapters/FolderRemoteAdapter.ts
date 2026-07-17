import {extname, join, resolve, sep} from "path"
import fs from "fs-extra"

import {logger} from "@/utils/logger"
import {assertKnownSnapshotVersion} from "@/utils/sync/snapshot/assertKnownSnapshotVersion"
import {isValidSnapshot} from "@/utils/sync/snapshot/isValidSnapshot"

import type {IRemoteStorage, Snapshot, SnapshotFile} from "@/types/sync"

const SNAPSHOT_FILENAME = "snapshot.json"
const SNAPSHOT_TMP_FILENAME = ".snapshot.tmp"

/**
 * IRemoteStorage over a plain local directory — the sync folder of a standalone
 * CLI node. Electron-free: no iCloud stubs, no file coordinator. Writes are
 * atomic (tmp + rename), so a concurrent reader sees the old or the new
 * snapshot in full, never a torn file.
 */
export class FolderRemoteAdapter implements IRemoteStorage {
  private readonly snapshotPath: string

  constructor(private readonly syncDir: string) {
    this.snapshotPath = join(syncDir, SNAPSHOT_FILENAME)
  }

  async loadSnapshot(): Promise<Snapshot | null> {
    let raw: string
    try {
      raw = await fs.readFile(this.snapshotPath, "utf-8")
    } catch (err: any) {
      if (err.code === "ENOENT") return null
      throw err
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Snapshot is not valid JSON, treating as empty")
      return null
    }

    assertKnownSnapshotVersion(parsed)

    if (!isValidSnapshot(parsed as Snapshot)) {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Invalid snapshot structure, treating as empty")
      return null
    }

    const snapshot = parsed as Snapshot
    snapshot.docs.branches = snapshot.docs.branches ?? []
    snapshot.docs.events = snapshot.docs.events ?? []
    return snapshot
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    await fs.ensureDir(this.syncDir)
    const tmpPath = join(this.syncDir, SNAPSHOT_TMP_FILENAME)
    await fs.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8")
    await fs.rename(tmpPath, this.snapshotPath)
  }

  async syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void> {
    const remoteAssetsDir = join(this.syncDir, "assets")
    await fs.ensureDir(remoteAssetsDir)
    await fs.ensureDir(localAssetsDir)

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

        if (localExists && !remoteExists) {
          await fs.copy(localPath, remotePath)
        } else if (remoteExists && !localExists) {
          await fs.copy(remotePath, localPath)
        }
      } catch (err) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Failed to sync asset ${filename}`, err)
      }
    }
  }
}
