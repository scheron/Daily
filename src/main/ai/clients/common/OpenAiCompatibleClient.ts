import {logger} from "@/utils/logger"

import {APP_CONFIG} from "@/config"

import type {IAiClient, MessageLLM, Tool, ToolCallLLM, ToolChoice} from "@/ai/types"
import type {AIConfig} from "@shared/types/ai"
import type {ChatRequest, OpenAiChatConfig, OpenAiChatResponse, OpenAiConnectionConfig} from "./types"

/**
 * OpenAI-Compatible API Client
 * (DeepSeek, Groq, Together, etc. and Local LLM (llama.cpp))
 */
export abstract class OpenAiCompatibleClient implements IAiClient {
  private readonly MODELS_LIMIT_COUNT = APP_CONFIG.ai.runtime.openAiCompatible.modelsLimitCount
  private readonly CONNECTION_TIMEOUT_MS = APP_CONFIG.ai.runtime.openAiCompatible.connectionTimeoutMs

  abstract updateConfig(config: AIConfig | null): void

  protected abstract getClientName(): string
  protected abstract getConnectionConfig(): OpenAiConnectionConfig | null
  protected abstract getChatConfig(): OpenAiChatConfig | null

  async checkConnection(): Promise<boolean> {
    const config = this.getConnectionConfig()
    if (!config) return false

    try {
      logger.info(logger.CONTEXT.AI, `Checking ${this.getClientName()} connection`, {baseUrl: config.baseUrl})

      const response = await fetch(`${config.baseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        signal: AbortSignal.timeout(this.CONNECTION_TIMEOUT_MS),
      })

      logger.info(logger.CONTEXT.AI, `${this.getClientName()} connection check response`, {response: response.ok})

      return response.ok
    } catch (e) {
      logger.error(logger.CONTEXT.AI, `Failed to check ${this.getClientName()} connection`, {error: e})
      return false
    }
  }

  async listModels(): Promise<string[]> {
    const config = this.getConnectionConfig()
    if (!config) return []

    try {
      const response = await fetch(`${config.baseUrl}/models`, {
        headers: {Authorization: `Bearer ${config.apiKey}`},
      })

      if (!response.ok) return []

      const data = (await response.json()) as {data?: Array<{id: string}>}

      return data.data?.map((m) => m.id).slice(0, this.MODELS_LIMIT_COUNT) ?? []
    } catch {
      return []
    }
  }

  async chat(messages: MessageLLM[], tools?: Tool[], signal?: AbortSignal, toolChoice?: ToolChoice): Promise<{message: MessageLLM; done: boolean}> {
    const config = this.getChatConfig()
    if (!config) {
      logger.error(logger.CONTEXT.AI, `${this.getClientName()} config is not set`)
      return {message: {role: "assistant", content: `${this.getClientName()} config is not set`}, done: false}
    }

    logger.info(logger.CONTEXT.AI, `${this.getClientName()} chat request`, {model: config.model, messagesCount: messages.length, toolChoice})

    const openAiMessages = this.convertMessages(messages, config.model)
    const requestBody: ChatRequest = {
      model: config.model,
      messages: openAiMessages,
      tools,
      tool_choice: toolChoice,
      stream: false,
      temperature: config.temperature,
      top_p: config.top_p,
      top_k: config.top_k,
      min_p: config.min_p,
      max_tokens: config.max_tokens,
      repeat_penalty: config.repeat_penalty,
      repeat_last_n: config.repeat_last_n,
      presence_penalty: config.presence_penalty,
      frequency_penalty: config.frequency_penalty,
      dry_multiplier: config.dry_multiplier,
      dry_base: config.dry_base,
      dry_allowed_length: config.dry_allowed_length,
      dry_penalty_last_n: config.dry_penalty_last_n,
      seed: config.seed,
    }

    const startedAt = Date.now()
    const HEARTBEAT_MS = 15_000
    const heartbeat = setInterval(() => {
      logger.info(logger.CONTEXT.AI, `${this.getClientName()} still waiting for response`, {
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        model: config.model,
        baseUrl: config.baseUrl,
      })
    }, HEARTBEAT_MS)
    heartbeat.unref?.()

    let response: Response
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      })
    } catch (err) {
      clearInterval(heartbeat)
      logger.error(logger.CONTEXT.AI, `${this.getClientName()} chat fetch failed`, {
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      })
      throw err
    }

    if (!response.ok) {
      clearInterval(heartbeat)
      const error = await response.text()
      throw new Error(`${this.getClientName()} error: ${error}`)
    }

    let result: OpenAiChatResponse
    try {
      result = (await response.json()) as OpenAiChatResponse
    } catch (err) {
      clearInterval(heartbeat)
      logger.error(logger.CONTEXT.AI, `${this.getClientName()} chat body parse failed`, {
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      })
      throw err
    }
    clearInterval(heartbeat)
    const choice = result.choices[0]

    if (!choice) {
      throw new Error(`No response from ${this.getClientName()}`)
    }

    const message = this.convertResponseMessage(choice.message)
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000)

    logger.info(logger.CONTEXT.AI, `${this.getClientName()} chat response`, {
      elapsedSec,
      hasToolCalls: !!message.tool_calls?.length,
      toolCallNames: message.tool_calls?.map((tc) => tc.function.name) ?? [],
      contentLength: message.content?.length ?? 0,
      contentPreview: message.content ? `${message.content.slice(0, 120)}${message.content.length > 120 ? "…" : ""}` : null,
      finishReason: choice.finish_reason ?? null,
    })

    return {message, done: true}
  }

  private convertMessages(messages: MessageLLM[], model: string): MessageLLM[] {
    const needsReasoningContent = /deepseek-reasoner/i.test(model)

    logger.debug(logger.CONTEXT.AI, "Converting messages to OpenAI format", {model, messagesCount: messages.length})
    return messages.map((msg) => {
      const message: MessageLLM = {
        role: msg.role,
        content: msg.content || null,
      }

      if (msg.reasoning_content !== undefined) {
        message.reasoning_content = msg.reasoning_content
      } else if (needsReasoningContent && msg.role === "assistant") {
        // DeepSeek thinking models require this field in assistant history entries.
        message.reasoning_content = msg.content ?? ""
      }

      if (msg.tool_calls) {
        message.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.function.name,
            arguments: JSON.stringify(tc.function.arguments),
          },
        }))
      }

      if (msg.tool_call_id) {
        message.tool_call_id = msg.tool_call_id
      }

      return message
    })
  }

  private convertResponseMessage(msg: MessageLLM): MessageLLM {
    const message: MessageLLM = {
      role: msg.role,
      content: msg.content ?? "",
    }

    if (msg.reasoning_content !== undefined) {
      message.reasoning_content = msg.reasoning_content
    }

    if (msg.tool_calls) {
      message.tool_calls = msg.tool_calls.map((tc): ToolCallLLM => {
        try {
          return {id: tc.id, type: "function", function: {name: tc.function.name, arguments: JSON.parse(tc.function.arguments as string)}}
        } catch {
          return {id: tc.id, type: "function", function: {name: tc.function.name, arguments: {}}}
        }
      })
    }

    return message
  }
}
