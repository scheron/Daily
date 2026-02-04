import {LogContext, logger} from "@/utils/logger"

import {APP_CONFIG} from "@/config"
import {OpenAiClient} from "./providers/OpenAiClient"
import {ToolExecutor} from "./tools/ToolExecutor"
import {AI_TOOLS} from "./tools/tools"
import {filterThinkingBlocks, getSystemPrompt} from "./utils"

import type {StorageController} from "@/storage/StorageController"
import type {AIConfig, AIMessage, AIResponse} from "@shared/types/ai"
import type {BrowserWindow} from "electron"
import type {ToolName} from "./tools/tools"
import type {MessageLLM, ToolCallLLM} from "./types"

/**
 * AI Service
 *
 * Orchestrates communication between the user, LLM providers (Ollama, OpenAI), and tool execution.
 * Implements the agentic loop: user message -> LLM -> (tool calls -> LLM)* -> response
 */
export class AIService {
  // private ollamaClient: OllamaClient
  private openAiClient: OpenAiClient
  private executor: ToolExecutor | null = null
  private conversationHistory: MessageLLM[] = []
  private abortController: AbortController | null = null
  private config: AIConfig = APP_CONFIG.ai

  constructor() {
    // this.ollamaClient = new OllamaClient(this.config.ollamaUrl)
    this.openAiClient = new OpenAiClient(this.config.openai)
  }

  setStorage(storage: StorageController): void {
    this.executor = new ToolExecutor(storage)
  }

  updateConfig(config: Partial<AIConfig>): void {
    this.config = {...this.config, ...config}
    // this.ollamaClient.setBaseUrl(this.config.ollamaUrl)
    this.openAiClient.setConfig(this.config.openai)
  }

  getConfig(): AIConfig {
    return {...this.config}
  }

  async checkConnection(): Promise<boolean> {
    // if (this.config.provider === "ollama") {
    //   return this.ollamaClient.checkConnection()
    // } else {
    return this.openAiClient.checkConnection()
    // }
  }

  async listModels(): Promise<string[]> {
    // if (this.config.provider === "ollama") {
    //   return this.ollamaClient.listModels()
    // } else {
    return this.openAiClient.listModels()
    // }
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

  async sendMessage(userMessage: string, mainWindow?: BrowserWindow | null): Promise<AIResponse> {
    if (!this.executor) {
      return {success: false, error: "Storage not initialized"}
    }

    if (!this.config.enabled) {
      return {success: false, error: "AI assistant is disabled"}
    }

    logger.info(LogContext.AI, "Processing message", {
      messageLength: userMessage.length,
      provider: this.config.provider,
    })

    this.abortController = new AbortController()

    try {
      this.conversationHistory.push({
        role: "user",
        content: userMessage,
      })

      const toolCalls: Array<{name: string; result: string}> = []
      let finalContent = ""

      // Agentic loop
      let iterations = 0
      const maxIterations = 10 // Prevent infinite loops

      while (iterations < maxIterations) {
        iterations++

        // Build messages with system prompt
        const messages: MessageLLM[] = [{role: "system", content: getSystemPrompt()}, ...this.conversationHistory]

        // Call LLM based on provider
        const response = await this.callLLM(messages)
        const assistantMessage = response.message

        // Check if there are tool calls
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // Add assistant message with tool calls to history
          this.conversationHistory.push(assistantMessage)

          // Execute each tool call
          for (const toolCall of assistantMessage.tool_calls) {
            const result = await this.executeToolCall(toolCall)
            toolCalls.push({name: toolCall.function.name, result: result.data?.toString() || result.error || "Done"})

            // Add tool result to history
            this.conversationHistory.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
            })
          }

          // Stream partial response to UI if we have content
          if (mainWindow && assistantMessage.content) {
            mainWindow.webContents.send("ai:stream-chunk", assistantMessage.content)
          }
        } else {
          // No tool calls - this is the final response
          // Filter out any thinking/reasoning blocks from the response
          finalContent = filterThinkingBlocks(assistantMessage.content ?? "")
          this.conversationHistory.push({
            role: "assistant",
            content: finalContent,
          })
          break
        }
      }

      // Create the response message
      const responseMessage: AIMessage = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: finalContent,
        timestamp: Date.now(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }

      logger.info(LogContext.AI, "Message processed", {
        iterations,
        toolCallsCount: toolCalls.length,
        responseLength: finalContent.length,
      })

      return {success: true, message: responseMessage}
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // Remove the user message from history on error
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
    // if (this.config.provider === "ollama") {
    //   return this.ollamaClient.chat({
    //     model: this.config.model,
    //     messages,
    //     tools: AI_TOOLS,
    //   })
    // } else {
    return this.openAiClient.chat(messages, AI_TOOLS)
    // }
  }

  private async executeToolCall(toolCall: ToolCallLLM): Promise<{success: boolean; data?: string; error?: string}> {
    if (!this.executor) {
      return {success: false, error: "Executor not initialized"}
    }

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
