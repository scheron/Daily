import {deepMerge} from "@shared/utils/common/deepMerge"
import {LogContext, logger} from "@/utils/logger"

import {LocalLLMProvider} from "./providers/local/LocalLLMProvider"
import {OpenAiClient} from "./providers/OpenAiClient"
import {ToolExecutor} from "./tools/ToolExecutor"
import {AI_TOOLS, AI_TOOLS_COMPACT} from "./tools/tools"
import {filterThinkingBlocks, getSystemPrompt, getSystemPromptCompact} from "./utils"

import type {StorageController} from "@/storage/StorageController"
import type {AIConfig, AIMessage, AIResponse, LocalRuntimeState} from "@shared/types/ai"
import type {IAIProvider} from "./providers/IAIProvider"
import type {ModelManager} from "./providers/local/models/ModelManager"
import type {ToolName} from "./tools/tools"
import type {MessageLLM, ToolCallLLM} from "./types"

/**
 * AI Service
 *
 * Orchestrates communication between the user, LLM providers (OpenAI, Local), and tool execution.
 * Implements the agentic loop: user message -> LLM -> (tool calls -> LLM)* -> response
 */
export class AIController {
  private openaiProvider: OpenAiClient
  private localProvider: LocalLLMProvider
  private executor: ToolExecutor
  private conversationHistory: MessageLLM[] = []
  private abortController: AbortController | null = null
  private config: AIConfig | null = null

  constructor(
    private storage: StorageController,
    broadcastState?: (state: LocalRuntimeState) => void,
  ) {
    this.executor = new ToolExecutor(storage)
    this.openaiProvider = new OpenAiClient()
    this.localProvider = new LocalLLMProvider(broadcastState)
  }

  private get activeProvider(): IAIProvider {
    return this.config?.provider === "local" ? this.localProvider : this.openaiProvider
  }

  async init() {
    const config = (await this.storage.loadSettings()).ai
    await this.localProvider.modelManager.init()
    await this.updateConfig(config)
  }

  async updateConfig(config: AIConfig | null) {
    if (config?.enabled) config.provider = config?.provider ?? "openai"

    const previousProvider = this.config?.provider

    this.config = deepMerge(this.config, config)

    await this.storage.saveSettings({ai: this.config!})

    // Update both providers so they have current config
    this.openaiProvider.updateConfig(this.config)
    this.localProvider.updateConfig(this.config)

    // If switching away from local, stop the server
    if (previousProvider === "local" && this.config?.provider !== "local") {
      await this.localProvider.dispose()
    }

    return true
  }

  async checkConnection(): Promise<boolean> {
    return this.activeProvider.checkConnection()
  }

  async listModels(): Promise<string[]> {
    return this.activeProvider.listModels()
  }

  getModelManager(): ModelManager {
    return this.localProvider.modelManager
  }

  async getLocalState(): Promise<LocalRuntimeState> {
    const serverState = this.localProvider.getState()

    // Server state is "not_installed" by default — enrich with model info
    if (serverState.status === "not_installed") {
      const selectedModel = this.config?.local?.model
      if (selectedModel && (await this.localProvider.modelManager.isInstalled(selectedModel))) {
        return {status: "installed", modelId: selectedModel}
      }
    }

    return serverState
  }

  async dispose(): Promise<void> {
    await this.localProvider.dispose()
  }

  clearHistory(): boolean {
    this.conversationHistory = []
    return true
  }

  cancel(): boolean {
    this.abortController?.abort()
    this.abortController = null
    return true
  }

  async sendMessage(userMessage: string): Promise<AIResponse> {
    if (!this.executor) return {success: false, error: "Storage not initialized"}
    const config = (await this.storage.loadSettings()).ai

    if (!config?.enabled) return {success: false, error: "AI assistant is disabled"}

    logger.info(LogContext.AI, "Processing message", {messageLength: userMessage.length, provider: config.provider})

    this.abortController = new AbortController()

    try {
      this.conversationHistory.push({role: "user", content: userMessage})

      const toolCalls: Array<{name: string; result: string}> = []
      let finalContent = ""

      let iterations = 0
      const maxIterations = 10
      const isLocal = this.config?.provider === "local"
      const systemPrompt = isLocal ? getSystemPromptCompact() : getSystemPrompt()

      while (iterations < maxIterations) {
        iterations++

        const messages: MessageLLM[] = [{role: "system", content: systemPrompt}, ...this.conversationHistory]

        const response = await this.callLLM(messages)
        const assistantMessage = response.message

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length) {
          this.conversationHistory.push(assistantMessage)

          for (const toolCall of assistantMessage.tool_calls) {
            const result = await this.executeToolCall(toolCall)

            toolCalls.push({name: toolCall.function.name, result: result.data?.toString() || result.error || "Done"})
            this.conversationHistory.push({role: "tool", content: JSON.stringify(result), tool_call_id: toolCall.id})
          }
        } else {
          finalContent = filterThinkingBlocks(assistantMessage.content ?? "")
          this.conversationHistory.push({role: "assistant", content: finalContent})
          break
        }
      }

      const responseMessage: AIMessage = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: finalContent,
        timestamp: Date.now(),
        toolCalls: toolCalls.length ? toolCalls : [],
      }

      logger.info(LogContext.AI, "Message processed", {iterations, toolCallsCount: toolCalls.length, responseLength: finalContent.length})

      return {success: true, message: responseMessage}
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      this.conversationHistory.pop()

      if (error instanceof Error && error.name === "AbortError") {
        return {success: false, error: "Request cancelled"}
      }

      logger.error(LogContext.AI, "Failed to process message", error)
      return {success: false, error: message}
    } finally {
      this.abortController = null
    }
  }

  private async callLLM(messages: MessageLLM[]): Promise<{message: MessageLLM; done: boolean}> {
    const tools = this.config?.provider === "local" ? AI_TOOLS_COMPACT : AI_TOOLS
    return this.activeProvider.chat(messages, tools, this.abortController?.signal)
  }

  private async executeToolCall(toolCall: ToolCallLLM): Promise<{success: boolean; data?: string; error?: string}> {
    if (!this.executor) return {success: false, error: "Executor not initialized"}

    const {name, arguments: args} = toolCall.function
    logger.debug(LogContext.AI, `Tool call: ${name}`, args)

    const result = await this.executor.execute(name as ToolName, args as any)
    return {
      success: result.success,
      data: typeof result.data === "string" ? result.data : JSON.stringify(result.data),
      error: result.error,
    }
  }
}
