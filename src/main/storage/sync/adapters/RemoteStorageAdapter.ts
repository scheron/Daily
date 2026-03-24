import {extname, join, resolve} from "path"
import fs from "fs-extra"

import {coordinatedRead, coordinatedWrite, isICloudStub, requestDownload} from "@/utils/fileCoordinator"
import {logger} from "@/utils/logger"

import type {DeltaFile, DeltaRecord, DeviceManifest, IRemoteStorage, Snapshot, SnapshotFile} from "@/types/sync"

const BASELINE_DIR = "baseline"
const BASELINE_FILENAME = "snapshot.v3.json"
const DELTAS_DIR = "deltas"
const MANIFEST_FILENAME = "manifest.json"

export class RemoteStorageAdapter implements IRemoteStorage {
  private readonly syncDir: string

  constructor(syncDir: string) {
    this.syncDir = syncDir
  }

  async syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void> {
    const remoteAssetsDir = join(this.syncDir, "assets")
    await fs.ensureDir(remoteAssetsDir)

    for (const file of fileManifest) {
      const ext = extname(file.name).slice(1) || "bin"
      const filename = `${file.id}.${ext}`
      const localPath = join(localAssetsDir, filename)
      const remotePath = join(remoteAssetsDir, filename)

      if (!resolve(localPath).startsWith(resolve(localAssetsDir)) || !resolve(remotePath).startsWith(resolve(remoteAssetsDir))) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Skipping asset with suspicious path: ${filename}`)
        continue
      }

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

  private async ensureDeviceDir(deviceId: string): Promise<string> {
    const dir = join(this.syncDir, DELTAS_DIR, deviceId)
    await fs.ensureDir(dir)
    return dir
  }

  async loadBaseline(): Promise<Snapshot | null> {
    const baselinePath = join(this.syncDir, BASELINE_DIR, BASELINE_FILENAME)

    if (!(await fs.pathExists(baselinePath))) {
      // Check for iCloud stub
      const stubPath = join(this.syncDir, BASELINE_DIR, `.${BASELINE_FILENAME}.icloud`)
      if (await fs.pathExists(stubPath)) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, "Baseline is an iCloud stub, requesting download")
        await requestDownload(stubPath)
      }
      return null
    }

    if (isICloudStub(baselinePath)) {
      await requestDownload(baselinePath)
      return null
    }

    try {
      const buffer = await coordinatedRead(baselinePath)
      if (!buffer) return null

      const parsed = JSON.parse(buffer.toString("utf-8"))
      if (parsed.version !== 3 || !parsed.docs || !parsed.meta) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, "Invalid baseline structure")
        return null
      }

      return parsed as Snapshot
    } catch (err) {
      logger.error(logger.CONTEXT.SYNC_REMOTE, "Failed to read baseline", err)
      return null
    }
  }

  async saveBaseline(snapshot: Snapshot): Promise<void> {
    const baselineDir = join(this.syncDir, BASELINE_DIR)
    await fs.ensureDir(baselineDir)

    const data = Buffer.from(JSON.stringify(snapshot, null, 2), "utf-8")
    await coordinatedWrite(join(baselineDir, BASELINE_FILENAME), data)
  }

  async listDeviceManifests(): Promise<DeviceManifest[]> {
    const deltasDir = join(this.syncDir, DELTAS_DIR)

    if (!(await fs.pathExists(deltasDir))) return []

    const entries = await fs.readdir(deltasDir, {withFileTypes: true})
    const manifests: DeviceManifest[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const manifestPath = join(deltasDir, entry.name, MANIFEST_FILENAME)

      try {
        if (!(await fs.pathExists(manifestPath))) {
          // Check for iCloud stub
          const stubPath = join(deltasDir, entry.name, `.${MANIFEST_FILENAME}.icloud`)
          if (await fs.pathExists(stubPath)) {
            await requestDownload(stubPath)
          }
          continue
        }

        if (isICloudStub(manifestPath)) {
          await requestDownload(manifestPath)
          continue
        }

        const buffer = await coordinatedRead(manifestPath)
        if (!buffer) continue

        const manifest = JSON.parse(buffer.toString("utf-8")) as DeviceManifest
        if (manifest.version === 3) {
          manifests.push(manifest)
        }
      } catch (err) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Failed to read manifest for device ${entry.name}`, err)
      }
    }

    return manifests
  }

  async loadDeviceManifest(deviceId: string): Promise<DeviceManifest | null> {
    const manifestPath = join(this.syncDir, DELTAS_DIR, deviceId, MANIFEST_FILENAME)

    if (!(await fs.pathExists(manifestPath))) {
      const stubPath = join(this.syncDir, DELTAS_DIR, deviceId, `.${MANIFEST_FILENAME}.icloud`)
      if (await fs.pathExists(stubPath)) {
        await requestDownload(stubPath)
      }
      return null
    }

    if (isICloudStub(manifestPath)) {
      await requestDownload(manifestPath)
      return null
    }

    try {
      const buffer = await coordinatedRead(manifestPath)
      if (!buffer) return null

      return JSON.parse(buffer.toString("utf-8")) as DeviceManifest
    } catch (err) {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, `Failed to read manifest for device ${deviceId}`, err)
      return null
    }
  }

  async saveDeviceManifest(manifest: DeviceManifest): Promise<void> {
    const dir = await this.ensureDeviceDir(manifest.device_id)
    const data = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8")
    await coordinatedWrite(join(dir, MANIFEST_FILENAME), data)
  }

  async loadDeltas(deviceId: string, afterSequence: number): Promise<DeltaRecord[]> {
    const deviceDir = join(this.syncDir, DELTAS_DIR, deviceId)

    if (!(await fs.pathExists(deviceDir))) return []

    const entries = await fs.readdir(deviceDir)
    const deltaFiles: {from: number; to: number; filename: string}[] = []

    for (const filename of entries) {
      const match = filename.match(/^(\d+)-(\d+)\.json$/)
      if (!match) continue

      const from = parseInt(match[1], 10)
      const to = parseInt(match[2], 10)

      if (to > afterSequence) {
        deltaFiles.push({from, to, filename})
      }
    }

    // Sort by from ascending
    deltaFiles.sort((a, b) => a.from - b.from)

    const allDeltas: DeltaRecord[] = []

    for (const df of deltaFiles) {
      const filePath = join(deviceDir, df.filename)

      if (isICloudStub(filePath)) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Delta file ${df.filename} is a stub, requesting download`)
        await requestDownload(filePath)
        continue
      }

      try {
        const buffer = await coordinatedRead(filePath)
        if (!buffer) continue

        const deltaFile = JSON.parse(buffer.toString("utf-8")) as DeltaFile
        for (const delta of deltaFile.deltas) {
          if (delta.sequence > afterSequence) {
            allDeltas.push(delta)
          }
        }
      } catch (err) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, `Failed to read delta file ${df.filename}`, err)
      }
    }

    return allDeltas
  }

  async saveDeltaFile(deltaFile: DeltaFile): Promise<void> {
    const dir = await this.ensureDeviceDir(deltaFile.device_id)
    const filename = `${deltaFile.sequence_from}-${deltaFile.sequence_to}.json`
    const data = Buffer.from(JSON.stringify(deltaFile, null, 2), "utf-8")
    await coordinatedWrite(join(dir, filename), data)
  }

  async pruneDeltas(watermarks: Record<string, number>): Promise<number> {
    let totalDeleted = 0

    for (const [deviceId, watermark] of Object.entries(watermarks)) {
      const deviceDir = join(this.syncDir, DELTAS_DIR, deviceId)

      if (!(await fs.pathExists(deviceDir))) continue

      const entries = await fs.readdir(deviceDir)

      for (const filename of entries) {
        const match = filename.match(/^(\d+)-(\d+)\.json$/)
        if (!match) continue

        const to = parseInt(match[2], 10)
        if (to <= watermark) {
          await fs.remove(join(deviceDir, filename))
          totalDeleted++
        }
      }
    }

    return totalDeleted
  }
}
