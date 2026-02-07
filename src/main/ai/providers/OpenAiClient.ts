import {LogContext, logger} from "@/utils/logger"

import type {AIConfig} from "@shared/types/ai"
import type {ChatRequest, MessageLLM, OpenAiChatResponse, Tool, ToolCallLLM} from "../types"
import type {IAIProvider} from "./IAIProvider"

/**
 * OpenAI-Compatible API Client
 *
 * HTTP client for communicating with OpenAI API and compatible services
 * (DeepSeek, Groq, Together, etc.)
 */
export class OpenAiClient implements IAIProvider {
  private readonly MODELS_LIMIT_COUNT = 20
  private config: AIConfig["openai"] | null = null

  updateConfig(config: AIConfig | null) {
    this.config = config?.openai ?? null
  }

  async checkConnection(): Promise<boolean> {
    if (!this.config?.apiKey || !this.config?.baseUrl) return false

    try {
      logger.info(LogContext.AI, "Checking OpenAI connection", {baseUrl: this.config.baseUrl})

      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      })

      logger.info(LogContext.AI, "OpenAI connection check response", {response: response.ok})

      return response.ok
    } catch (e) {
      logger.error(LogContext.AI, "Failed to check OpenAI connection", {error: e})
      return false
    }
  }

  async listModels(): Promise<string[]> {
    if (!this.config?.apiKey) return []

    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: {Authorization: `Bearer ${this.config.apiKey}`},
      })

      if (!response.ok) return []

      const data = (await response.json()) as {data?: Array<{id: string}>}

      return data.data?.map((m) => m.id).slice(0, this.MODELS_LIMIT_COUNT) ?? []
    } catch {
      return []
    }
  }

  async chat(messages: MessageLLM[], tools?: Tool[], signal?: AbortSignal): Promise<{message: MessageLLM; done: boolean}> {
    if (!this.config?.model || !this.config?.apiKey || !this.config.baseUrl) {
      logger.error(LogContext.AI, "OpenAI config is not set")
      return {message: {role: "assistant", content: "OpenAI config is not set"}, done: false}
    }

    logger.info(LogContext.AI, "OpenAI chat request", {model: this.config.model, messagesCount: messages.length})

    const openAiMessages = this.convertMessages(messages)

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey ?? ""}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: openAiMessages,
        tools,
        stream: false,
      } satisfies ChatRequest),
      signal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI error: ${error}`)
    }

    const result = (await response.json()) as OpenAiChatResponse
    const choice = result.choices[0]

    if (!choice) {
      throw new Error("No response from OpenAI")
    }

    const message = this.convertResponseMessage(choice.message)

    logger.info(LogContext.AI, "OpenAI chat response", {
      hasToolCalls: !!message.tool_calls?.length,
      contentLength: message.content?.length ?? 0,
    })

    return {message, done: true}
  }

  private convertMessages(messages: MessageLLM[]): MessageLLM[] {
    logger.info(LogContext.AI, "Converting messages to OpenAI format", {messages})
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
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments as string)
        } catch {
          // Keep empty args if parsing fails
        }

        return {
          id: tc.id,
          type: "function",
          function: {
            name: tc.function.name,
            arguments: args,
          },
        }
      })
    }

    return message
  }
}
