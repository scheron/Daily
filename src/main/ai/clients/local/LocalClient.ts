import {logger} from "@/utils/logger"

import {OpenAiCompatibleClient} from "@/ai/clients/common/OpenAiCompatibleClient"
import {APP_CONFIG} from "@/config"
import {LlamaServer} from "./core/LlamaServer"
import {LocalModelService} from "./core/LocalModelService"

import type {OpenAiChatConfig} from "@/ai/clients/common/types"
import type {IAiClient} from "@/ai/types"
import type {AIConfig, LocalModelId, LocalRuntimeState} from "@shared/types/ai"

export class LocalAiClient extends OpenAiCompatibleClient implements IAiClient {
  private server: LlamaServer
  readonly modelService: LocalModelService

  private config: AIConfig["local"] | null = null
  private loadedModelId: LocalModelId | null = null
  private runtimeConfig: OpenAiChatConfig | null = null
  private ensurePromise: Promise<boolean> | null = null

  constructor(onStateChange?: (state: LocalRuntimeState) => void) {
    super()
    this.server = new LlamaServer(onStateChange)
    this.modelService = new LocalModelService()
  }

  updateConfig(config: AIConfig | null): void {
    const previousModel = this.config?.model
    this.config = config?.local ?? null

    if (previousModel && this.config?.model !== previousModel) {
      this.runtimeConfig = null
    }
  }

  getState(): LocalRuntimeState {
    return this.server.getState()
  }

  protected getClientName(): string {
    return "Local LLM"
  }

  protected getConnectionConfig() {
    if (!this.runtimeConfig) return null
    return {baseUrl: this.runtimeConfig.baseUrl, apiKey: this.runtimeConfig.apiKey}
  }

  protected getChatConfig() {
    if (!this.runtimeConfig) return null

    const modelId = this.config?.model
    if (!modelId) return this.runtimeConfig

    const manifest = this.modelService.getEntry(modelId)
    if (!manifest) return this.runtimeConfig

    const params = this.config?.params
    const sa = manifest.serverArgs
    return {
      ...this.runtimeConfig,
      temperature: params?.temperature ?? sa.temperature,
      top_p: params?.topP ?? sa.topP,
      top_k: params?.topK ?? sa.topK,
      min_p: params?.minP ?? sa.minP,
      max_tokens: params?.maxTokens,
      repeat_penalty: params?.repeatPenalty ?? sa.repeatPenalty,
      repeat_last_n: params?.repeatLastN ?? sa.repeatLastN,
      presence_penalty: params?.presencePenalty ?? sa.presencePenalty,
      frequency_penalty: params?.frequencyPenalty ?? sa.frequencyPenalty,
      dry_multiplier: params?.dryMultiplier ?? sa.dryMultiplier,
      dry_base: params?.dryBase ?? sa.dryBase,
      dry_allowed_length: params?.dryAllowedLength ?? sa.dryAllowedLength,
      dry_penalty_last_n: params?.dryPenaltyLastN ?? sa.dryPenaltyLastN,
      seed: params?.seed,
    }
  }

  async checkConnection(): Promise<boolean> {
    if (this.ensurePromise) return this.ensurePromise
    this.ensurePromise = this.runConnect().finally(() => {
      this.ensurePromise = null
    })
    return this.ensurePromise
  }

  private async runConnect(): Promise<boolean> {
    if (!this.config?.model) return false

    const modelId = this.config.model
    const installed = await this.modelService.isInstalled(modelId)
    if (!installed) return false

    try {
      await this.server.ensureBinary()

      if (!this.server.isRunning() || this.loadedModelId !== modelId) {
        await this.server.stop()

        const modelPath = this.modelService.getModelPath(modelId)
        const manifest = this.modelService.getEntry(modelId)
        if (!manifest) return false

        await this.server.start(modelPath, modelId, manifest.serverArgs)

        this.loadedModelId = modelId
      }

      this.runtimeConfig = {
        baseUrl: `http://${APP_CONFIG.ai.runtime.local.host}:${this.server.getPort()}${APP_CONFIG.ai.runtime.local.apiPath}`,
        apiKey: APP_CONFIG.ai.runtime.local.apiKey,
        model: modelId,
      }

      return super.checkConnection()
    } catch (err) {
      this.runtimeConfig = null
      logger.error(logger.CONTEXT.AI, "Local LLM connection failed", err)
      return false
    }
  }

  async listModels(): Promise<string[]> {
    const models = await this.modelService.listModels()
    return models.filter((m) => m.installed).map((m) => m.id)
  }

  async dispose(): Promise<void> {
    await this.server.stop()
    this.loadedModelId = null
    this.runtimeConfig = null
  }
}
