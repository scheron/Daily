import {stat} from "node:fs/promises"
import path from "node:path"
import fs from "fs-extra"

import {AI_CONFIG} from "@shared/config/ai"
import {LocalModelErrorCode} from "@shared/errors/ai/LocalModelErrorCode"
import {forEachParallel} from "@shared/utils/arrays/forEachParallel"
import {downloadWithProgress} from "@/utils/files/downloadWithProgress"
import {logger} from "@/utils/logger"

import {electronPaths} from "@/runtime/electronPaths"
import {loadCatalog, parseCatalog} from "./catalog"
import {fetchRemoteCatalog, readCachedCatalog, writeCachedCatalog} from "./remoteCatalog"

import type {CatalogRefreshResult, LocalModelDownloadProgress, LocalModelId, LocalModelInfo} from "@shared/types/ai"
import type {ILocalModelService, ModelManifestEntry} from "../types"

type CatalogSource = {url: string; cachePath: string; bundledPath: string}

export class LocalModelService implements ILocalModelService {
  private readonly modelsDirOverride: string | null
  private readonly injectedCatalog: ModelManifestEntry[] | null
  private readonly catalogSourceOverride: CatalogSource | null
  private catalog: ModelManifestEntry[] = []
  private activeDownloads = new Map<string, AbortController>()

  constructor(modelsDir?: string, catalog?: ModelManifestEntry[], catalogSource?: CatalogSource) {
    this.modelsDirOverride = modelsDir ?? null
    this.injectedCatalog = catalog ?? null
    this.catalogSourceOverride = catalogSource ?? null
  }

  async init(): Promise<void> {
    this.catalog = this.injectedCatalog ?? (await this.loadInitialCatalog())
    await fs.ensureDir(this.modelsDir)
    await this.cleanupOrphanedModels()
  }

  async refreshCatalog(): Promise<CatalogRefreshResult> {
    if (this.injectedCatalog) return "unchanged"
    const {url, cachePath} = this.catalogSource

    let raw: string
    try {
      raw = await fetchRemoteCatalog(url, {timeoutMs: AI_CONFIG.runtime.local.catalogTimeoutMs})
    } catch (err) {
      logger.warn(logger.CONTEXT.AI, "Remote catalog fetch failed", {error: err})
      return "failed"
    }

    const parsed = parseCatalog(raw)
    if (parsed.length === 0) {
      logger.warn(logger.CONTEXT.AI, "Remote catalog rejected (empty/invalid/unsupported); keeping current")
      return "failed"
    }

    const previous = await readCachedCatalog(cachePath)
    this.catalog = parsed
    await writeCachedCatalog(cachePath, raw)
    return previous === raw ? "unchanged" : "updated"
  }

  getEntry(modelId: LocalModelId): ModelManifestEntry | undefined {
    return this.catalog.find((m) => m.id === modelId)
  }

  getCatalog(): ReadonlyArray<ModelManifestEntry> {
    return this.catalog
  }

  async isInstalled(modelId: LocalModelId): Promise<boolean> {
    const entry = this.getEntry(modelId)
    if (!entry) return false
    return fs.pathExists(this.getModelPath(modelId))
  }

  getModelPath(modelId: LocalModelId): string {
    const entry = this.getEntry(modelId)
    if (!entry) throw new Error(`${LocalModelErrorCode.UnknownModel}: ${modelId}`)
    return path.join(this.modelsDir, entry.ggufFilename)
  }

  async listModels(): Promise<LocalModelInfo[]> {
    const results: LocalModelInfo[] = new Array(this.catalog.length)
    await forEachParallel(this.catalog, async (entry, index) => {
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
      results[index] = info
    })
    const orphans = await this.listOrphanedModels()
    return [...results, ...orphans]
  }

  async downloadModel(modelId: LocalModelId, onProgress: (progress: LocalModelDownloadProgress) => void): Promise<boolean> {
    const entry = this.getEntry(modelId)
    if (!entry) throw new Error(`${LocalModelErrorCode.UnknownModel}: ${modelId}`)

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
    const filename = entry?.ggufFilename ?? modelId
    if (!filename.toLowerCase().endsWith(".gguf") || filename.includes("/") || filename.includes("..")) return false

    const modelPath = path.join(this.modelsDir, filename)
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

  private get modelsDir(): string {
    return this.modelsDirOverride ?? electronPaths.modelsPath()
  }

  private get catalogSource(): CatalogSource {
    return (
      this.catalogSourceOverride ?? {
        url: AI_CONFIG.runtime.local.catalogUrl,
        cachePath: electronPaths.modelsCatalogCachePath(),
        bundledPath: electronPaths.modelsCatalogPath(),
      }
    )
  }

  private async loadInitialCatalog(): Promise<ModelManifestEntry[]> {
    const {cachePath, bundledPath} = this.catalogSource
    const cached = await readCachedCatalog(cachePath)
    if (cached) {
      const parsed = parseCatalog(cached)
      if (parsed.length > 0) return parsed
    }
    return loadCatalog(bundledPath)
  }

  private async cleanupOrphanedModels(): Promise<void> {
    const knownPartials = new Set(this.catalog.map((entry) => `${entry.ggufFilename}.download`))
    const files = (await fs.readdir(this.modelsDir)) as string[]
    const orphanPartials = files.filter((file) => file.toLowerCase().endsWith(".download") && !knownPartials.has(file))
    await forEachParallel(orphanPartials, async (file) => {
      await fs.remove(path.join(this.modelsDir, file))
      logger.info(logger.CONTEXT.AI, "Removed orphaned partial download", {file})
    })
  }

  private async listOrphanedModels(): Promise<LocalModelInfo[]> {
    const known = new Set(this.catalog.map((entry) => entry.ggufFilename))
    let files: string[]
    try {
      files = await fs.readdir(this.modelsDir)
    } catch {
      return []
    }
    const orphanFiles = files.filter((file) => file.toLowerCase().endsWith(".gguf") && !known.has(file))
    return Promise.all(
      orphanFiles.map(async (file) => {
        const size = (await stat(path.join(this.modelsDir, file))).size
        return {
          id: file,
          title: file.replace(/\.gguf$/i, ""),
          description: "No longer in the catalog.",
          sizeBytes: size,
          requirements: {ramGb: 0, diskGb: 0},
          installed: true,
          orphaned: true,
        } satisfies LocalModelInfo
      }),
    )
  }

  private async partialBytes(entry: ModelManifestEntry): Promise<number> {
    try {
      return (await stat(path.join(this.modelsDir, `${entry.ggufFilename}.download`))).size
    } catch {
      return 0
    }
  }
}
