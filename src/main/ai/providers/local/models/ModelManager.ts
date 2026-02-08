import {stat} from "node:fs/promises"
import path from "node:path"
import fs from "fs-extra"

import {LogContext, logger} from "@/utils/logger"

import {fsPaths} from "@/config"
import {downloadWithProgress} from "./downloadWithProgress"
import {getManifestEntry, MODEL_MANIFEST} from "./manifest"

import type {LocalModelDownloadProgress, LocalModelId, LocalModelInfo} from "@shared/types/ai"

/**
 * Manages GGUF model files on disk.
 *
 * Handles downloading, deleting, and querying installed model state.
 */
export class ModelManager {
  private activeDownloads = new Map<string, AbortController>()

  async init(): Promise<void> {
    await fs.ensureDir(fsPaths.modelsPath())
  }

  async isInstalled(modelId: LocalModelId): Promise<boolean> {
    const entry = getManifestEntry(modelId)
    if (!entry) return false
    return fs.pathExists(this.getModelPath(modelId))
  }

  getModelPath(modelId: LocalModelId): string {
    const entry = getManifestEntry(modelId)
    if (!entry) throw new Error(`Unknown model: ${modelId}`)
    return path.join(fsPaths.modelsPath(), entry.ggufFilename)
  }

  async listModels(): Promise<LocalModelInfo[]> {
    const results: LocalModelInfo[] = []

    for (const entry of MODEL_MANIFEST) {
      const installed = await this.isInstalled(entry.id)
      results.push({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        sizeBytes: entry.sizeBytes,
        requirements: entry.requirements,
        installed,
        recommended: entry.recommended,
      })
    }

    return results
  }

  async downloadModel(modelId: LocalModelId, onProgress: (progress: LocalModelDownloadProgress) => void): Promise<boolean> {
    const entry = getManifestEntry(modelId)
    if (!entry) throw new Error(`Unknown model: ${modelId}`)

    if (await this.isInstalled(modelId)) {
      logger.info(LogContext.AI, "Model already installed", {modelId})
      return true
    }

    if (this.activeDownloads.has(modelId)) {
      logger.info(LogContext.AI, "Download already in progress", {modelId})
      return false
    }

    await fs.ensureDir(fsPaths.modelsPath())

    const abortController = new AbortController()
    this.activeDownloads.set(modelId, abortController)

    try {
      await downloadWithProgress({
        url: entry.ggufUrl,
        destPath: this.getModelPath(modelId),
        signal: abortController.signal,
        onProgress: (downloadedBytes, totalBytes) => {
          const total = totalBytes || entry.sizeBytes
          onProgress({
            modelId,
            percent: total > 0 ? Math.round((downloadedBytes / total) * 100) : 0,
            downloadedBytes,
            totalBytes: total,
          })
        },
      })

      logger.info(LogContext.AI, "Model downloaded successfully", {modelId})
      return true
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        logger.info(LogContext.AI, "Model download cancelled", {modelId})
        return false
      }
      logger.error(LogContext.AI, "Model download failed", {modelId, error: err})
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
    const entry = getManifestEntry(modelId)
    if (!entry) return false

    const modelPath = this.getModelPath(modelId)
    if (!(await fs.pathExists(modelPath))) return false

    await fs.remove(modelPath)
    logger.info(LogContext.AI, "Model deleted", {modelId})
    return true
  }

  async getDiskUsage(): Promise<{total: number; models: Record<string, number>}> {
    const models: Record<string, number> = {}
    let total = 0

    for (const entry of MODEL_MANIFEST) {
      const modelPath = path.join(fsPaths.modelsPath(), entry.ggufFilename)
      if (await fs.pathExists(modelPath)) {
        const stats = await stat(modelPath)
        models[entry.id] = stats.size
        total += stats.size
      }
    }

    return {total, models}
  }
}
