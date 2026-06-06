import {nanoid} from "nanoid"

import {wordDiff} from "@shared/utils/diff/wordDiff"
import {stripThinking} from "@shared/utils/stripThinking"
import {logger} from "@/utils/logger"

import {APP_CONFIG} from "@/config"
import {LlamaServer} from "./LlamaServer"
import {UNLOAD_OPTION_MS} from "./manifest"
import {ModelService} from "./ModelService"
import {OpenAiCompatibleClient} from "./OpenAiCompatibleClient"
import {getPromptForMode, unwrapOutput, wrapInput} from "./prompts"

import type {StorageController} from "@/storage/StorageController"
import type {ModelDownloadProgress, ModelId, RuntimeState} from "@shared/types/ai"
import type {Correction, CorrectionRequest, CorrectionResult} from "@shared/types/correction"
import type {ChatMessage, ChatOptions} from "./OpenAiCompatibleClient"

export type AIControllerBroadcast = {
  onStateChanged: (state: RuntimeState) => void
  onDownloadProgress: (progress: ModelDownloadProgress) => void
}

export type AIControllerDeps = {
  modelService?: ModelService
  llamaServer?: LlamaServer
  client?: OpenAiCompatibleClient
}

/**
 * Composition root for the local AI stack. Owns one LlamaServer + one ModelService
 * + one HTTP client. Server start is lazy — triggered by correct() or prewarm().
 */
export class AIController {
  private readonly modelService: ModelService
  private readonly client: OpenAiCompatibleClient
  private readonly injectedServer: LlamaServer | null
  private server: LlamaServer | null = null

  private activeCorrection: AbortController | null = null
  // NOTE: not keyed by modelId — safe while no model-switch UI exists; revisit in phase 5.
  private ensurePromise: Promise<void> | null = null
  private lastActivityAt = Date.now()
  private idleTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private storage: StorageController,
    private broadcast: AIControllerBroadcast,
    deps: AIControllerDeps = {},
  ) {
    this.modelService = deps.modelService ?? new ModelService()
    this.injectedServer = deps.llamaServer ?? null
    this.client = deps.client ?? new OpenAiCompatibleClient()
  }

  async init(): Promise<void> {
    this.server = this.injectedServer ?? new LlamaServer({onStateChange: this.broadcast.onStateChanged})
    await this.modelService.init()
    this.idleTimer = setInterval(() => {
      this.checkIdle().catch((err) => logger.error(logger.CONTEXT.AI, "Idle check failed (swallowed)", err))
    }, 60_000)
    this.idleTimer.unref?.()
    logger.info(logger.CONTEXT.AI, "AIController initialized")
  }

  async dispose(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
    if (this.activeCorrection) this.activeCorrection.abort()
    this.activeCorrection = null
    if (!this.server) return
    await this.server.stop()
  }

  getModelService(): ModelService {
    return this.modelService
  }

  async getState(): Promise<RuntimeState> {
    const serverState = this.server?.getState() ?? {status: "not_installed"}
    if (serverState.status !== "not_installed") return serverState

    const settings = await this.storage.loadSettings()
    const selected = settings.ai.model
    if (selected && (await this.modelService.isInstalled(selected))) {
      return {status: "installed", modelId: selected}
    }
    return serverState
  }

  async hasUsableModel(): Promise<boolean> {
    return (await this.getState()).status !== "not_installed"
  }

  async downloadModel(id: ModelId): Promise<boolean> {
    return this.modelService.downloadModel(id, this.broadcast.onDownloadProgress)
  }

  async deleteModel(id: ModelId): Promise<boolean> {
    const serverState = this.server?.getState()
    const serverModelId = serverState && "modelId" in serverState ? serverState.modelId : null
    if (this.server && serverModelId === id) {
      await this.server.unload()
    }

    const ok = await this.modelService.deleteModel(id)

    const settings = await this.storage.loadSettings()
    if (settings.ai.model === id) {
      await this.storage.saveSettings({ai: {...settings.ai, model: null}})
    }

    this.broadcast.onStateChanged(await this.getState())
    return ok
  }

  prewarm(): void {
    this.prewarmAsync().catch((err) => {
      logger.error(logger.CONTEXT.AI, "Prewarm failed (swallowed)", err)
    })
  }

  private async prewarmAsync(): Promise<void> {
    const settings = await this.storage.loadSettings()
    const modelId = settings.ai.model
    if (!modelId) return
    if (!(await this.modelService.isInstalled(modelId))) return
    this.lastActivityAt = Date.now()
    await this.ensureRunning(modelId)
  }

  private async checkIdle(): Promise<void> {
    if (!this.server?.isRunning()) return
    const settings = await this.storage.loadSettings()
    const ms = UNLOAD_OPTION_MS[settings.unloadModel]
    if (ms === null) return
    if (Date.now() - this.lastActivityAt <= ms) return
    logger.info(logger.CONTEXT.AI, "Idle timeout reached, unloading server")
    await this.server.stop()
  }

  async correct(req: CorrectionRequest): Promise<CorrectionResult> {
    if (this.activeCorrection) this.activeCorrection.abort()
    const controller = new AbortController()
    this.activeCorrection = controller
    this.lastActivityAt = Date.now()

    const settings = await this.storage.loadSettings()
    const modelId = settings.ai.model
    if (!modelId || !(await this.modelService.isInstalled(modelId))) {
      if (this.activeCorrection === controller) this.activeCorrection = null
      return {ok: false, code: "no-model", error: "Choose a model in Settings"}
    }

    try {
      await this.ensureRunning(modelId)
    } catch (err) {
      if (this.activeCorrection === controller) this.activeCorrection = null
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.AI, "Server start failed", err)
      return {ok: false, code: "server-down", error: message}
    }

    if (this.activeCorrection !== controller) {
      return {ok: false, code: "cancelled", error: "Cancelled"}
    }

    const manifest = this.modelService.getEntry(modelId)
    if (!manifest) {
      if (this.activeCorrection === controller) this.activeCorrection = null
      return {ok: false, code: "unknown", error: `Unknown model: ${modelId}`}
    }

    const params = settings.ai.params ?? {}
    const port = this.server?.getPort()
    if (!port) {
      if (this.activeCorrection === controller) this.activeCorrection = null
      return {ok: false, code: "server-down", error: "Server has no port"}
    }

    const opts: ChatOptions = {
      baseUrl: `http://${APP_CONFIG.ai.runtime.local.host}:${port}${APP_CONFIG.ai.runtime.local.apiPath}`,
      apiKey: APP_CONFIG.ai.runtime.local.apiKey,
      model: modelId,
      temperature: params.temperature ?? 0.2,
      maxTokens: params.maxTokens ?? Math.min(Math.floor(manifest.serverArgs.ctx / 2), 1024),
    }
    if (params.topP !== undefined) opts.topP = params.topP
    if (params.topK !== undefined) opts.topK = params.topK
    if (params.repeatPenalty !== undefined) opts.repeatPenalty = params.repeatPenalty
    if (params.repeatLastN !== undefined) opts.repeatLastN = params.repeatLastN
    if (params.seed !== undefined) opts.seed = params.seed
    if (manifest.disableThinking) opts.disableThinking = true

    const messages: ChatMessage[] = [
      {role: "system", content: getPromptForMode(req.mode)},
      {role: "user", content: wrapInput(req.text)},
    ]

    let corrected: string
    try {
      corrected = await this.client.chat(messages, opts, controller.signal)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return {ok: false, code: "cancelled", error: "Cancelled"}
      }
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.AI, "Chat failed", err)
      return {ok: false, code: "server-down", error: message}
    } finally {
      if (this.activeCorrection === controller) this.activeCorrection = null
    }

    corrected = unwrapOutput(stripThinking(corrected))
    const ops = wordDiff(req.text, corrected)
    const correction: Correction = {
      id: nanoid(),
      createdAt: new Date().toISOString(),
      mode: req.mode,
      original: req.text,
      corrected,
      modelId,
    }
    return {ok: true, correction, ops}
  }

  async cancel(): Promise<boolean> {
    const controller = this.activeCorrection
    if (!controller) return false
    controller.abort()
    this.activeCorrection = null
    return true
  }

  private async ensureRunning(modelId: ModelId): Promise<void> {
    if (this.ensurePromise) return this.ensurePromise

    const promise = this.runEnsure(modelId)
    this.ensurePromise = promise
    try {
      await promise
    } finally {
      this.ensurePromise = null
    }
  }

  private async runEnsure(modelId: ModelId): Promise<void> {
    if (!this.server) throw new Error("AIController not initialised")
    const server = this.server
    if (server.isRunning() && server.getCurrentModelId() === modelId) return

    const manifest = this.modelService.getEntry(modelId)
    if (!manifest) throw new Error(`Unknown model: ${modelId}`)
    const modelPath = this.modelService.getModelPath(modelId)

    await server.ensureBinary()
    await server.stop()
    await server.start(modelPath, modelId, manifest.serverArgs)
  }
}
