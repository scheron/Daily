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

  async migrate(newRoot: string, removeOldDir = false): Promise<void> {
    const assetsDir = fsPaths.assetsDir(newRoot)

    await fs.ensureDir(assetsDir)

    for (const file of await fs.readdir(this.assetsDir)) {
      const from = path.join(this.assetsDir, file)
      const to = path.join(assetsDir, file)
      await fs.copy(from, to)
    }

    if (removeOldDir) await fs.remove(this.assetsDir)
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

  
}
