import {join} from "path"
import fs from "fs-extra"

import {getDefaultSnapshot} from "@/utils/sync/snapshot/getDefaultSnapshot"
import {isValidSnapshot} from "@/utils/sync/snapshot/isValidSnapshot"

import type {IRemoteStorage, Snapshot} from "@/types/sync"

/**
 * RemoteStore implements RemoteStorageAdapter using local file system.
 *
 * Files are stored in a specified directory:
 * - snapshot.json - Full Snapshot data with embedded meta (docs + meta)
 */
export class RemoteStorageAdapter implements IRemoteStorage {
  private readonly syncDir: string
  private readonly snapshotPath: string

  constructor(syncDir: string) {
    this.syncDir = syncDir
    this.snapshotPath = join(this.syncDir, "snapshot.json")
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.syncDir, {recursive: true})
    } catch (err: any) {
      if (err.code !== "EEXIST") {
        throw new Error(`Failed to create sync directory: ${err.message}`)
      }
    }
  }

  /**
   * Load snapshot from file.
   */
  async loadSnapshot(): Promise<Snapshot | null> {
    try {
      const content = await fs.readFile(this.snapshotPath, "utf-8")
      return this._deserializeSnapshot(content)
    } catch (err: any) {
      if (err.code === "ENOENT") return null
      throw new Error(`Failed to load snapshot: ${err.message}`)
    }
  }

  /**
   * Save snapshot to file.
   */
  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    try {
      await this.ensureDir()

      const snapshotContent = this._serializeSnapshot(snapshot)
      await fs.writeFile(this.snapshotPath, snapshotContent, "utf-8")
    } catch (err: any) {
      throw new Error(`Failed to save snapshot: ${err.message}`)
    }
  }

  private _serializeSnapshot(snapshot: Snapshot): string {
    return JSON.stringify(snapshot, null, 2)
  }

  private _deserializeSnapshot(json: string): Snapshot {
    try {
      const parsed = JSON.parse(json)

      if (!isValidSnapshot(parsed)) {
        console.error("[deserializeSnapshot] Invalid snapshot structure")
        return getDefaultSnapshot()
      }

      return parsed as Snapshot
    } catch (error) {
      console.error("[deserializeSnapshot] Error parsing snapshot:", error)
      return getDefaultSnapshot()
    }
  }
}
