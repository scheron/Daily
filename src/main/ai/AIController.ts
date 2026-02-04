import {deepMerge} from "@shared/utils/common/deepMerge"
import {LogContext, logger} from "@/utils/logger"

import {OpenAiClient} from "./providers/OpenAiClient"
import {ToolExecutor} from "./tools/ToolExecutor"
import {AI_TOOLS} from "./tools/tools"
import {filterThinkingBlocks, getSystemPrompt} from "./utils"

import type {StorageController} from "@/storage/StorageController"
import type {AIConfig, AIMessage, AIResponse} from "@shared/types/ai"
import type {ToolName} from "./tools/tools"
import type {MessageLLM, ToolCallLLM} from "./types"

/**
 * AI Service
 *
 * Orchestrates communication between the user, LLM providers (Ollama, OpenAI), and tool execution.
 * Implements the agentic loop: user message -> LLM -> (tool calls -> LLM)* -> response
 */
export class AIController {
  private aiProvider: OpenAiClient
  private executor: ToolExecutor
  private conversationHistory: MessageLLM[] = []
  private abortController: AbortController | null = null
  private config: AIConfig | null = null

  constructor(private storage: StorageController) {
    this.executor = new ToolExecutor(storage)
    this.aiProvider = new OpenAiClient()
  }

  async init() {
    const config = (await this.storage.loadSettings()).ai
    await this.updateConfig(config)
  }

  async updateConfig(config: AIConfig | null) {
    if (config?.enabled) config.provider = config?.provider ?? "openai"

    this.config = deepMerge(this.config, config)

    await this.storage.saveSettings({ai: this.config!})
    this.aiProvider.updateConfig(this.config)

    return true
  }

  async checkConnection(): Promise<boolean> {
    return this.aiProvider.checkConnection()
  }

  async listModels(): Promise<string[]> {
    return this.aiProvider.listModels()
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

      while (iterations < maxIterations) {
        iterations++

        const messages: MessageLLM[] = [{role: "system", content: getSystemPrompt()}, ...this.conversationHistory]

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
    return this.aiProvider.chat(messages, AI_TOOLS)
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
