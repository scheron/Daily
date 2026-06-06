import {stat} from "node:fs/promises"
import path from "node:path"
import fs from "fs-extra"

import {downloadWithProgress} from "@/utils/files/downloadWithProgress"
import {logger} from "@/utils/logger"

import {fsPaths} from "@/config"
import {loadCatalog} from "./catalog"

import type {LocalModelDownloadProgress, LocalModelId, LocalModelInfo} from "@shared/types/ai"
import type {ILocalModelService, ModelManifestEntry} from "../types"

export class LocalModelService implements ILocalModelService {
  private readonly modelsDirOverride: string | null
  private readonly injectedCatalog: ModelManifestEntry[] | null
  private catalog: ModelManifestEntry[] = []
  private activeDownloads = new Map<string, AbortController>()

  constructor(modelsDir?: string, catalog?: ModelManifestEntry[]) {
    this.modelsDirOverride = modelsDir ?? null
    this.injectedCatalog = catalog ?? null
  }

  private get modelsDir(): string {
    return this.modelsDirOverride ?? fsPaths.modelsPath()
  }

  async init(): Promise<void> {
    this.catalog = this.injectedCatalog ?? (await loadCatalog(fsPaths.modelsCatalogPath()))
    await fs.ensureDir(this.modelsDir)
    await this.cleanupOrphanedModels()
  }

  getEntry(modelId: LocalModelId): ModelManifestEntry | undefined {
    return this.catalog.find((m) => m.id === modelId)
  }

  getCatalog(): ReadonlyArray<ModelManifestEntry> {
    return this.catalog
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

  async isInstalled(modelId: LocalModelId): Promise<boolean> {
    const entry = this.getEntry(modelId)
    if (!entry) return false
    return fs.pathExists(this.getModelPath(modelId))
  }

  getModelPath(modelId: LocalModelId): string {
    const entry = this.getEntry(modelId)
    if (!entry) throw new Error(`Unknown model: ${modelId}`)
    return path.join(this.modelsDir, entry.ggufFilename)
  }

  async listModels(): Promise<LocalModelInfo[]> {
    const results: LocalModelInfo[] = []
    for (const entry of this.catalog) {
      const installed = await this.isInstalled(entry.id)
      const info: LocalModelInfo = {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        sizeBytes: entry.sizeBytes,
        requirements: entry.requirements,
        installed,
        recommended: entry.recommended,
        accuracy: entry.accuracy ?? undefined,
        tier: entry.tier,
      }
      if (!installed) {
        const partial = await this.partialBytes(entry)
        if (partial > 0) info.partialBytes = partial
      }
      results.push(info)
    }
    return results
  }

  private async partialBytes(entry: ModelManifestEntry): Promise<number> {
    try {
      return (await stat(path.join(this.modelsDir, `${entry.ggufFilename}.download`))).size
    } catch {
      return 0
    }
  }

  async downloadModel(modelId: LocalModelId, onProgress: (progress: LocalModelDownloadProgress) => void): Promise<boolean> {
    const entry = this.getEntry(modelId)
    if (!entry) throw new Error(`Unknown model: ${modelId}`)

    if (await this.isInstalled(modelId)) {
      logger.info(logger.CONTEXT.AI, "Model already installed", {modelId})
      return true
    }

    if (this.activeDownloads.has(modelId)) {
      logger.info(logger.CONTEXT.AI, "Download already in progress", {modelId})
      return false
    }

    await fs.ensureDir(this.modelsDir)
    const abortController = new AbortController()
    this.activeDownloads.set(modelId, abortController)

    try {
      await downloadWithProgress({
        url: entry.ggufUrl,
        destPath: this.getModelPath(modelId),
        sha256: entry.sha256,
        signal: abortController.signal,
        onProgress: (downloadedBytes, totalBytes, phase) => {
          const total = totalBytes || entry.sizeBytes
          onProgress({
            modelId,
            percent: total > 0 ? Math.round((downloadedBytes / total) * 100) : 0,
            downloadedBytes,
            totalBytes: total,
            phase,
          })
        },
      })
      logger.info(logger.CONTEXT.AI, "Model downloaded successfully", {modelId})
      return true
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        logger.info(logger.CONTEXT.AI, "Model download cancelled", {modelId})
        return false
      }
      logger.error(logger.CONTEXT.AI, "Model download failed", {modelId, error: err})
      throw err
    } finally {
      this.activeDownloads.delete(modelId)
    }
  }

  async cancelDownload(modelId: LocalModelId): Promise<boolean> {
    const controller = this.activeDownloads.get(modelId)
    if (!controller) return false
    controller.abort()
    this.activeDownloads.delete(modelId)
    return true
  }

  async deleteModel(modelId: LocalModelId): Promise<boolean> {
    const entry = this.getEntry(modelId)
    if (!entry) return false
    const modelPath = this.getModelPath(modelId)
    const partialPath = `${modelPath}.download`
    const hadModel = await fs.pathExists(modelPath)
    const hadPartial = await fs.pathExists(partialPath)
    if (!hadModel && !hadPartial) return false
    if (hadModel) await fs.remove(modelPath)
    if (hadPartial) await fs.remove(partialPath)
    logger.info(logger.CONTEXT.AI, "Model deleted", {modelId, hadModel, hadPartial})
    return true
  }

  async getDiskUsage(): Promise<{total: number; models: Record<string, number>}> {
    const models: Record<string, number> = {}
    let total = 0
    for (const entry of this.catalog) {
      const modelPath = path.join(this.modelsDir, entry.ggufFilename)
      if (await fs.pathExists(modelPath)) {
        const s = await stat(modelPath)
        models[entry.id] = s.size
        total += s.size
      }
    }
    return {total, models}
  }
}
