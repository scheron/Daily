import {stat} from "node:fs/promises"
import path from "node:path"
import fs from "fs-extra"

import {downloadWithProgress} from "@/utils/files/downloadWithProgress"
import {logger} from "@/utils/logger"

import {fsPaths} from "@/config"
import {loadCatalog} from "./catalog"
import {speedScoreFromSize} from "./modelSpeed"

import type {ModelDownloadProgress, ModelId, ModelInfo} from "@shared/types/ai"
import type {IModelService, ModelManifestEntry} from "./types"

export class ModelService implements IModelService {
  private readonly modelsDir: string
  private readonly injectedCatalog: ModelManifestEntry[] | null
  private catalog: ModelManifestEntry[] = []
  private activeDownloads = new Map<ModelId, AbortController>()

  constructor(modelsDir?: string, catalog?: ModelManifestEntry[]) {
    this.modelsDir = modelsDir ?? fsPaths.modelsDir()
    this.injectedCatalog = catalog ?? null
  }

  async init(): Promise<void> {
    this.catalog = this.injectedCatalog ?? (await loadCatalog(fsPaths.modelsCatalogPath()))
    await fs.ensureDir(this.modelsDir)
    await this.cleanupOrphanedModels()
  }

  getEntry(id: ModelId): ModelManifestEntry | undefined {
    return this.catalog.find((m) => m.id === id)
  }

  private async cleanupOrphanedModels(): Promise<void> {
    const knownGguf = new Set(this.catalog.map((entry) => entry.ggufFilename))
    const knownPartials = new Set(this.catalog.map((entry) => `${entry.ggufFilename}.download`))
    const files = await fs.readdir(this.modelsDir)
    const orphans = files.filter((file) => {
      const lower = file.toLowerCase()
      if (lower.endsWith(".download")) return !knownPartials.has(file)
      if (lower.endsWith(".gguf")) return !knownGguf.has(file)
      return false
    })
    for (const file of orphans) {
      await fs.remove(path.join(this.modelsDir, file))
      logger.info(logger.CONTEXT.AI, "Removed orphaned model file", {file})
    }
  }

  async isInstalled(id: ModelId): Promise<boolean> {
    const entry = this.getEntry(id)
    if (!entry) return false
    return fs.pathExists(this.getModelPath(id))
  }

  getModelPath(id: ModelId): string {
    const entry = this.getEntry(id)
    if (!entry) throw new Error(`Unknown model: ${id}`)
    return path.join(this.modelsDir, entry.ggufFilename)
  }

  private async partialBytes(entry: ModelManifestEntry): Promise<number> {
    try {
      return (await stat(path.join(this.modelsDir, `${entry.ggufFilename}.download`))).size
    } catch {
      return 0
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const out: ModelInfo[] = []
    for (const entry of this.catalog) {
      const installed = await this.isInstalled(entry.id)
      const info: ModelInfo = {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        sizeBytes: entry.sizeBytes,
        requirements: entry.requirements,
        installed,
        recommended: entry.recommended,
        accuracy: entry.accuracy,
        speed: speedScoreFromSize(entry.sizeBytes),
      }
      if (!installed) {
        const partial = await this.partialBytes(entry)
        if (partial > 0) info.partialBytes = partial
      }
      out.push(info)
    }
    return out.sort((a, b) => {
      const recDiff = Number(Boolean(b.recommended)) - Number(Boolean(a.recommended))
      if (recDiff !== 0) return recDiff
      return a.requirements.ramGb - b.requirements.ramGb
    })
  }

  async downloadModel(id: ModelId, onProgress: (progress: ModelDownloadProgress) => void): Promise<boolean> {
    const entry = this.getEntry(id)
    if (!entry) throw new Error(`Unknown model: ${id}`)

    if (await this.isInstalled(id)) {
      logger.info(logger.CONTEXT.AI, "Model already installed", {id})
      return true
    }
    if (this.activeDownloads.has(id)) {
      logger.info(logger.CONTEXT.AI, "Download already in progress", {id})
      return false
    }

    await fs.ensureDir(this.modelsDir)
    const controller = new AbortController()
    this.activeDownloads.set(id, controller)

    try {
      await downloadWithProgress({
        url: entry.ggufUrl,
        destPath: this.getModelPath(id),
        sha256: entry.sha256,
        signal: controller.signal,
        onProgress: (downloadedBytes, totalBytes, phase) => {
          const total = totalBytes || entry.sizeBytes
          onProgress({
            modelId: id,
            percent: total > 0 ? Math.round((downloadedBytes / total) * 100) : 0,
            downloadedBytes,
            totalBytes: total,
            phase,
          })
        },
      })
      logger.info(logger.CONTEXT.AI, "Model downloaded", {id})
      return true
    } catch (err) {
      if (controller.signal.aborted) {
        logger.info(logger.CONTEXT.AI, "Model download cancelled", {id})
        return false
      }
      logger.error(logger.CONTEXT.AI, "Model download failed", {id, error: err})
      throw err
    } finally {
      this.activeDownloads.delete(id)
    }
  }

  async cancelDownload(id: ModelId): Promise<boolean> {
    const controller = this.activeDownloads.get(id)
    if (!controller) return false
    controller.abort()
    return true
  }

  async deleteModel(id: ModelId): Promise<boolean> {
    const entry = this.getEntry(id)
    if (!entry) return false
    const modelPath = this.getModelPath(id)
    const partialPath = `${modelPath}.download`
    const hadModel = await fs.pathExists(modelPath)
    const hadPartial = await fs.pathExists(partialPath)
    if (!hadModel && !hadPartial) return false
    if (hadModel) await fs.remove(modelPath)
    if (hadPartial) await fs.remove(partialPath)
    logger.info(logger.CONTEXT.AI, "Model deleted", {id, hadModel, hadPartial})
    return true
  }

  async getDiskUsage(): Promise<{total: number; models: Record<string, number>}> {
    const models: Record<string, number> = {}
    let total = 0
    for (const entry of this.catalog) {
      const p = path.join(this.modelsDir, entry.ggufFilename)
      if (await fs.pathExists(p)) {
        const s = await stat(p)
        models[entry.id] = s.size
        total += s.size
      }
    }
    return {total, models}
  }
}
