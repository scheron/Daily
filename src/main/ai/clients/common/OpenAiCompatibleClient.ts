import {logger} from "@/utils/logger"

import {APP_CONFIG} from "@/config"

import type {IAiClient, MessageLLM, Tool, ToolCallLLM} from "@/ai/types"
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

  async chat(messages: MessageLLM[], tools?: Tool[], signal?: AbortSignal): Promise<{message: MessageLLM; done: boolean}> {
    const config = this.getChatConfig()
    if (!config) {
      logger.error(logger.CONTEXT.AI, `${this.getClientName()} config is not set`)
      return {message: {role: "assistant", content: `${this.getClientName()} config is not set`}, done: false}
    }

    logger.info(logger.CONTEXT.AI, `${this.getClientName()} chat request`, {model: config.model, messagesCount: messages.length})

    const openAiMessages = this.convertMessages(messages)

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: openAiMessages,
        tools,
        stream: false,
      } satisfies ChatRequest),
      signal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`${this.getClientName()} error: ${error}`)
    }

    const result = (await response.json()) as OpenAiChatResponse
    const choice = result.choices[0]

    if (!choice) {
      throw new Error(`No response from ${this.getClientName()}`)
    }

    const message = this.convertResponseMessage(choice.message)

    logger.info(logger.CONTEXT.AI, `${this.getClientName()} chat response`, {
      hasToolCalls: !!message.tool_calls?.length,
      contentLength: message.content?.length ?? 0,
    })

    return {message, done: true}
  }

  private convertMessages(messages: MessageLLM[]): MessageLLM[] {
    logger.info(logger.CONTEXT.AI, "Converting messages to OpenAI format", {messages})
    return messages.map((msg) => {
      const message: MessageLLM = {
        role: msg.role,
        content: msg.content || null,
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
