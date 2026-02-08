import {LogContext, logger} from "@/utils/logger"

import {OpenAiClient} from "../OpenAiClient"
import {getManifestEntry} from "./models/manifest"
import {ModelManager} from "./models/ModelManager"
import {LlamaServerManager} from "./server/LlamaServerManager"

import type {AIConfig, LocalModelId, LocalRuntimeState} from "@shared/types/ai"
import type {MessageLLM, Tool} from "../../types"
import type {IAIProvider} from "../IAIProvider"

/**
 * Local LLM Provider
 *
 * Implements IAIProvider by composing LlamaServerManager + OpenAiClient.
 * llama-server exposes an OpenAI-compatible API, so we reuse OpenAiClient
 * pointed at http://127.0.0.1:{port}/v1.
 */
export class LocalLLMProvider implements IAIProvider {
  private server: LlamaServerManager
  private client: OpenAiClient
  readonly modelManager: ModelManager

  private config: AIConfig["local"] | null = null
  private loadedModelId: LocalModelId | null = null

  constructor(onStateChange?: (state: LocalRuntimeState) => void) {
    this.server = new LlamaServerManager(onStateChange)
    this.client = new OpenAiClient()
    this.modelManager = new ModelManager()
  }

  updateConfig(config: AIConfig | null): void {
    this.config = config?.local ?? null
  }

  getState(): LocalRuntimeState {
    return this.server.getState()
  }

  async checkConnection(): Promise<boolean> {
    if (!this.config?.model) return false

    const modelId = this.config.model
    const installed = await this.modelManager.isInstalled(modelId)
    if (!installed) return false

    try {
      // Ensure llama-server binary exists (download if needed)
      await this.server.ensureBinary()

      // Start server with selected model (if not already running with same model)
      if (!this.server.isRunning() || this.loadedModelId !== modelId) {
        await this.server.stop()

        const modelPath = this.modelManager.getModelPath(modelId)
        const manifest = getManifestEntry(modelId)
        if (!manifest) return false

        await this.server.start(modelPath, modelId, manifest.serverArgs)

        // Configure OpenAiClient to point at local server
        this.client.updateConfig({
          enabled: true,
          provider: "local",
          openai: {
            baseUrl: `http://127.0.0.1:${this.server.getPort()}/v1`,
            apiKey: "no-key",
            model: modelId,
          },
          local: this.config,
        })

        this.loadedModelId = modelId
      }

      return true
    } catch (err) {
      logger.error(LogContext.AI, "Local LLM connection failed", err)
      return false
    }
  }

  async listModels(): Promise<string[]> {
    const models = await this.modelManager.listModels()
    return models.filter((m) => m.installed).map((m) => m.id)
  }

  async chat(messages: MessageLLM[], tools?: Tool[], signal?: AbortSignal): Promise<{message: MessageLLM; done: boolean}> {
    return this.client.chat(messages, tools, signal)
  }

  async dispose(): Promise<void> {
    await this.server.stop()
    this.loadedModelId = null
  }
}
