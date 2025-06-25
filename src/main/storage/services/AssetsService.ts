import path from "node:path"
import fs from "fs-extra"
import {nanoid} from "nanoid"

import {getMimeType} from "../../helpers.js"
import {fsPaths} from "../utils/fsPaths.js"

export class AssetsService {
  assetsDir: string

  constructor(private rootDir: string) {
    this.assetsDir = fsPaths.assetsDir(this.rootDir)
  }

  async init(): Promise<void> {
    this.assetsDir = fsPaths.assetsDir(this.rootDir)

    await fs.ensureDir(this.assetsDir)
  }

  async saveAsset(filename: string, data: Buffer): Promise<string> {
    await fs.ensureDir(this.assetsDir)

    const ext = path.extname(filename)
    const uniqueFilename = `${nanoid()}${ext}`
    const filePath = path.join(this.assetsDir, uniqueFilename)

    await fs.writeFile(filePath, data)

    return uniqueFilename
  }

  async deleteAsset(filename: string): Promise<void> {
    const filePath = path.join(this.assetsDir, filename)

    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath)
    }
  }

  async getAssetPath(filename: string): Promise<string> {
    return path.join(this.assetsDir, filename)
  }

  async getAssetResponse(fileUrl: string): Promise<Response> {
    const filePath = path.join(this.assetsDir, decodeURIComponent(fileUrl))

    try {
      const data = await fs.readFile(filePath)
      const extension = path.extname(filePath).slice(1)
      const mime = getMimeType(extension)

      return new Response(data as any, {headers: {"Content-Type": mime}})
    } catch (e) {
      console.error("❌ Failed to load asset:", filePath, e)
      return new Response("Not Found", {status: 404})
    }
  }

  /* =============================== */
  /* ========== MIGRATION ========== */
  /* =============================== */

  /**
   * Copies all assets from the current storage to the new one
   */
  async migrateToNewLocation(newRootDir: string): Promise<void> {
    const newAssetsDir = fsPaths.assetsDir(newRootDir)

    await fs.ensureDir(newAssetsDir)

    if (await fs.pathExists(this.assetsDir)) {
      await fs.copy(this.assetsDir, newAssetsDir, {overwrite: true})
      console.log(`✅ Assets migrated from ${this.assetsDir} to ${newAssetsDir}`)
    }

    this.assetsDir = newAssetsDir
  }

  /**
   * Loads the assets from the target storage (without copying)
   */
  async loadFromLocation(newRootDir: string): Promise<void> {
    this.assetsDir = fsPaths.assetsDir(newRootDir)
    await fs.ensureDir(this.assetsDir)
    console.log(`✅ Assets loaded from ${this.assetsDir}`)
  }
}
