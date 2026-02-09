import {deepMerge} from "@shared/utils/common/deepMerge"
import {logger} from "@/utils/logger"

import {LocalAiClient} from "@/ai/clients/local"
import {getManifestEntry} from "@/ai/clients/local/core/manifest"
import {RemoteAiClient} from "@/ai/clients/remote"
import {getSystemPrompt} from "@/ai/promts/getSystemPrompt"
import {getSystemPromptCompact} from "@/ai/promts/getSystemPromptCompact"
import {getSystemPromptTiny} from "@/ai/promts/getSystemPromptTiny"
import {ToolExecutor} from "@/ai/tools/ToolExecutor"
import {AI_TOOLS, AI_TOOLS_COMPACT} from "@/ai/tools/tools"
import {filterThinkBlocks} from "./utils/filterThinkBlocks"

import type {ILocalModelService} from "@/ai/clients/local"
import type {ToolName} from "@/ai/tools/tools"
import type {IAiClient, MessageLLM, PromptTier, Tool, ToolCallLLM} from "@/ai/types"
import type {StorageController} from "@/storage/StorageController"
import type {AIConfig, AIMessage, AIResponse, LocalRuntimeState} from "@shared/types/ai"

export class AIController {
  private openaiClient: RemoteAiClient
  private localClient: LocalAiClient
  private executor: ToolExecutor
  private conversationHistory: MessageLLM[] = []
  private abortController: AbortController | null = null
  private config: AIConfig | null = null
  private currentToolSchemas = new Map<string, Tool["function"]["parameters"]>()

  constructor(
    private storage: StorageController,
    broadcastState?: (state: LocalRuntimeState) => void,
  ) {
    this.executor = new ToolExecutor(storage)
    this.openaiClient = new RemoteAiClient()
    this.localClient = new LocalAiClient(broadcastState)
  }

  private get activeProvider(): IAiClient {
    return this.config?.provider === "local" ? this.localClient : this.openaiClient
  }

  async init() {
    const config = (await this.storage.loadSettings()).ai
    await this.localClient.modelService.init()
    await this.updateConfig(config)
  }

  async updateConfig(config: AIConfig | null) {
    if (config?.enabled) config.provider = config?.provider ?? "openai"

    const previousProvider = this.config?.provider

    this.config = deepMerge(this.config, config)

    await this.storage.saveSettings({ai: this.config!})

    this.openaiClient.updateConfig(this.config)
    this.localClient.updateConfig(this.config)

    if (previousProvider === "local" && this.config?.provider !== "local") {
      await this.localClient.dispose()
    }

    return true
  }

  async checkConnection(): Promise<boolean> {
    return this.activeProvider.checkConnection()
  }

  async listModels(): Promise<string[]> {
    return this.activeProvider.listModels()
  }

  getLocalModel(): ILocalModelService {
    return this.localClient.modelService
  }

  async getLocalState(): Promise<LocalRuntimeState> {
    const serverState = this.localClient.getState()

    if (serverState.status === "not_installed") {
      const selectedModel = this.config?.local?.model

      if (selectedModel && (await this.localClient.modelService.isInstalled(selectedModel))) {
        return {status: "installed", modelId: selectedModel}
      }
    }

    return serverState
  }

  async dispose(): Promise<void> {
    await this.localClient.dispose()
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

    logger.info(logger.CONTEXT.AI, "Processing message", {messageLength: userMessage.length, provider: config.provider})

    this.abortController = new AbortController()

    try {
      this.conversationHistory.push({role: "user", content: userMessage})

      const toolCalls: Array<{name: string; result: string}> = []
      let finalContent = ""
      let requireVisibleFinalAnswer = false

      let iterations = 0
      const maxIterations = 10
      const promptTier = this.resolvePromptTier(config)
      const systemPrompt = this.getSystemPromptByTier(promptTier)
      logger.debug(logger.CONTEXT.AI, "Prompt tier selected", {
        tier: promptTier,
        provider: config.provider,
        model: config.openai?.model ?? config.local?.model,
      })

      while (iterations < maxIterations) {
        iterations++

        const messages: MessageLLM[] = [
          {role: "system", content: systemPrompt},
          ...(requireVisibleFinalAnswer
            ? [
                {
                  role: "system" as const,
                  content:
                    "Your previous output had no user-visible answer. Return a concise final answer only. Do not include reasoning labels like Thought/Action/Observation.",
                },
              ]
            : []),
          ...this.conversationHistory,
        ]

        const response = await this.callLLM(messages, promptTier)
        const assistantMessage = response.message

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length) {
          requireVisibleFinalAnswer = false
          this.conversationHistory.push(assistantMessage)

          for (const toolCall of assistantMessage.tool_calls) {
            const result = await this.executeToolCall(toolCall)

            toolCalls.push({name: toolCall.function.name, result: result.data?.toString() || result.error || "Done"})
            this.conversationHistory.push({role: "tool", content: JSON.stringify(result), tool_call_id: toolCall.id})
          }
        } else {
          const rawContent = assistantMessage.content ?? ""
          finalContent = filterThinkBlocks(rawContent)

          if (!finalContent && iterations < maxIterations) {
            requireVisibleFinalAnswer = true
            this.conversationHistory.push({role: "assistant", content: rawContent})
            continue
          }

          if (!finalContent) finalContent = "I completed the request, but could not produce a visible final response."
          this.conversationHistory.push({role: "assistant", content: finalContent})
          break
        }
      }

      if (!finalContent) {
        finalContent = "I completed the request, but could not produce a visible final response."
      }

      const responseMessage: AIMessage = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: finalContent,
        timestamp: Date.now(),
        toolCalls: toolCalls.length ? toolCalls : [],
      }

      logger.info(logger.CONTEXT.AI, "Message processed", {iterations, toolCallsCount: toolCalls.length, responseLength: finalContent.length})

      return {success: true, message: responseMessage}
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      this.conversationHistory.pop()

      if (error instanceof Error && error.name === "AbortError") {
        return {success: false, error: "Request cancelled"}
      }

      logger.error(logger.CONTEXT.AI, "Failed to process message", error)
      return {success: false, error: message}
    } finally {
      this.abortController = null
    }
  }

  private getSystemPromptByTier(tier: PromptTier): string {
    if (tier === "tiny") return getSystemPromptTiny()
    if (tier === "medium") return getSystemPromptCompact()
    return getSystemPrompt()
  }

  private resolvePromptTier(config: AIConfig | null): PromptTier {
    if (config?.provider === "local") {
      const modelId = config.local?.model
      if (!modelId) return "medium"
      return getManifestEntry(modelId)?.promptTier ?? "medium"
    }

    const modelName = config?.openai?.model?.toLowerCase() ?? ""
    if (!modelName) return "large"

    if (modelName.includes("nano")) return "tiny"
    if (modelName.includes("mini") || modelName.includes("small")) return "medium"

    const sizeMatch = modelName.match(/(\d+(?:\.\d+)?)b/)
    if (sizeMatch) {
      const sizeB = Number(sizeMatch[1])
      if (!Number.isNaN(sizeB)) {
        if (sizeB <= 4) return "tiny"
        if (sizeB <= 14) return "medium"
      }
    }

    return "large"
  }

  private async callLLM(messages: MessageLLM[], promptTier: PromptTier): Promise<{message: MessageLLM; done: boolean}> {
    const tools = this.getToolsForTier(promptTier)
    this.currentToolSchemas = new Map(tools.map((tool) => [tool.function.name, tool.function.parameters]))
    return this.activeProvider.chat(messages, tools, this.abortController?.signal)
  }

  private async executeToolCall(toolCall: ToolCallLLM): Promise<{success: boolean; data?: string; error?: string}> {
    if (!this.executor) return {success: false, error: "Executor not initialized"}

    const {name, arguments: args} = toolCall.function
    logger.debug(logger.CONTEXT.AI, `Tool call: ${name}`, args)

    const validationError = this.validateToolArguments(name, args)
    if (validationError) {
      logger.warn(logger.CONTEXT.AI, `Tool call rejected: ${name}`, {error: validationError, args})
      return {success: false, error: validationError}
    }

    const result = await this.executor.execute(name as ToolName, args as any)
    return {
      success: result.success,
      data: typeof result.data === "string" ? result.data : JSON.stringify(result.data),
      error: result.error,
    }
  }

  private getToolsForTier(promptTier: PromptTier): Tool[] {
    return promptTier === "large" ? AI_TOOLS : AI_TOOLS_COMPACT
  }

  private validateToolArguments(toolName: string, args: unknown): string | null {
    const schema = this.currentToolSchemas.get(toolName)
    if (!schema) return `Tool '${toolName}' is not available for this model tier`

    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return `Invalid arguments for '${toolName}': expected an object`
    }

    const params = args as Record<string, unknown>

    for (const key of schema.required ?? []) {
      if (params[key] === undefined || params[key] === null) {
        return `Invalid arguments for '${toolName}': '${key}' is required`
      }
    }

    for (const [key, descriptor] of Object.entries(schema.properties)) {
      const value = params[key]
      if (value === undefined || value === null) continue

      const typeMatches = this.isArgumentTypeValid(descriptor.type, value)
      if (!typeMatches) {
        return `Invalid arguments for '${toolName}': '${key}' must be ${descriptor.type}`
      }

      if (descriptor.enum && !descriptor.enum.includes(String(value))) {
        return `Invalid arguments for '${toolName}': '${key}' must be one of ${descriptor.enum.join(", ")}`
      }
    }

    return null
  }

  private isArgumentTypeValid(expectedType: string, value: unknown): boolean {
    if (expectedType === "array") return Array.isArray(value)
    if (expectedType === "number") return typeof value === "number" && Number.isFinite(value)
    if (expectedType === "string") return typeof value === "string"
    if (expectedType === "boolean") return typeof value === "boolean"
    if (expectedType === "object") return typeof value === "object" && value !== null && !Array.isArray(value)
    return true
  }
}
