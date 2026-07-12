import {AI_CONFIG} from "@shared/config/ai"
import {NonRetryableError} from "@shared/errors/ai/NonRetryableError"
import {OpenAiClientErrorCode} from "@shared/errors/ai/OpenAiClientErrorCode"
import {notUndefined} from "@shared/utils/common/validators"
import {logger} from "@/utils/logger"

import {ChatStreamAccumulator} from "./streaming/chatStreamAccumulator"
import {consumeSseEvents} from "./streaming/sseParser"

import type {ChatStreamCallbacks, IAiClient, MessageLLM, Tool, ToolCallLLM, ToolChoice} from "@/ai/types"
import type {AIConfig, TokenUsage} from "@shared/types/ai"
import type {ChatRequest, OpenAiChatConfig, OpenAiChatResponse, OpenAiConnectionConfig, OpenAiUsage} from "./types"

const backoff = (n: number): number => Math.min(1000 * 2 ** n, 4000)

/**
 * OpenAI-Compatible API Client
 * (DeepSeek, Groq, Together, etc. and Local LLM (llama.cpp))
 */
export abstract class OpenAiCompatibleClient implements IAiClient {
  private readonly MODELS_LIMIT_COUNT = AI_CONFIG.runtime.openAiCompatible.modelsLimitCount
  private readonly CONNECTION_TIMEOUT_MS = AI_CONFIG.runtime.openAiCompatible.connectionTimeoutMs

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

  async chat(
    messages: MessageLLM[],
    tools?: Tool[],
    signal?: AbortSignal,
    toolChoice?: ToolChoice,
    callbacks?: ChatStreamCallbacks,
  ): Promise<{message: MessageLLM; done: boolean; usage?: TokenUsage}> {
    const config = this.getChatConfig()
    if (!config) {
      logger.error(logger.CONTEXT.AI, `${this.getClientName()} config is not set`)
      return {message: {role: "assistant", content: `${this.getClientName()} config is not set`}, done: false}
    }

    if (callbacks?.onDelta) {
      return this.chatStreaming(messages, tools, signal, toolChoice, callbacks, config)
    }
    return this.chatSync(messages, tools, signal, toolChoice, config)
  }

  private async chatSync(
    messages: MessageLLM[],
    tools: Tool[] | undefined,
    signal: AbortSignal | undefined,
    toolChoice: ToolChoice | undefined,
    config: OpenAiChatConfig,
  ): Promise<{message: MessageLLM; done: boolean; usage?: TokenUsage}> {
    logger.info(logger.CONTEXT.AI, `${this.getClientName()} chat request`, {model: config.model, messagesCount: messages.length, toolChoice})

    const openAiMessages = this.convertMessages(messages, config.model)
    const requestBody = this.buildChatRequest(config, openAiMessages, tools, toolChoice, false)

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
      throw new Error(`${OpenAiClientErrorCode.ApiError}: ${this.getClientName()}: ${error}`)
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
      throw new Error(`${OpenAiClientErrorCode.NoResponse}: ${this.getClientName()}`)
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

    return {message, done: true, usage: this.toTokenUsage(result.usage)}
  }

  private async chatStreaming(
    messages: MessageLLM[],
    tools: Tool[] | undefined,
    signal: AbortSignal | undefined,
    toolChoice: ToolChoice | undefined,
    callbacks: ChatStreamCallbacks,
    config: OpenAiChatConfig,
  ): Promise<{message: MessageLLM; done: boolean; usage?: TokenUsage}> {
    const MAX_RETRIES = 2

    const openAiMessages = this.convertMessages(messages, config.model)
    const requestBody = this.buildChatRequest(config, openAiMessages, tools, toolChoice, true)

    logger.info(logger.CONTEXT.AI, `${this.getClientName()} chat request (stream)`, {
      model: config.model,
      messagesCount: messages.length,
      toolChoice,
    })

    const startedAt = Date.now()
    let lastErr: unknown = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const accumulator = new ChatStreamAccumulator()
      let usage: OpenAiUsage | undefined
      try {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "text/event-stream",
          },
          body: JSON.stringify(requestBody),
          signal,
        })

        if (response.status >= 500) {
          lastErr = new Error(`${OpenAiClientErrorCode.HttpError}: ${response.status} ${response.statusText}`)
          await new Promise((r) => setTimeout(r, backoff(attempt)))
          continue
        }
        if (!response.ok) {
          const errBody = await response.text().catch(() => "")
          throw new NonRetryableError(
            `${OpenAiClientErrorCode.HttpError}: ${this.getClientName()} HTTP ${response.status} ${response.statusText} ${errBody}`,
          )
        }
        if (!response.body) throw new Error(OpenAiClientErrorCode.NoResponseBody)

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let sseBuffer = ""

        try {
          while (true) {
            const {done, value} = await reader.read()
            if (done) break
            sseBuffer += decoder.decode(value, {stream: true})

            const {events, remainder} = consumeSseEvents(sseBuffer)
            sseBuffer = remainder

            let shouldBreak = false
            for (const ev of events) {
              if (ev === "[DONE]") {
                shouldBreak = true
                break
              }
              let parsed: any
              try {
                parsed = JSON.parse(ev)
              } catch {
                logger.warn(logger.CONTEXT.AI, "Skipping malformed SSE event", {ev})
                continue
              }
              if (parsed.usage) usage = parsed.usage
              const choice = parsed.choices?.[0]
              if (!choice) continue
              if (choice.delta) accumulator.feed(choice.delta, callbacks.onDelta!)
              if (choice.finish_reason) accumulator.setFinishReason(choice.finish_reason)
            }
            if (shouldBreak) break
          }
          accumulator.flush(callbacks.onDelta!)
        } finally {
          reader.releaseLock?.()
        }

        const message = accumulator.toMessage()
        logger.info(logger.CONTEXT.AI, `${this.getClientName()} chat response (stream)`, {
          elapsedSec: Math.round((Date.now() - startedAt) / 1000),
          hasToolCalls: !!message.tool_calls?.length,
          toolCallNames: message.tool_calls?.map((tc) => tc.function.name) ?? [],
          contentLength: message.content?.length ?? 0,
        })
        return {message, done: true, usage: this.toTokenUsage(usage)}
      } catch (err) {
        if (signal?.aborted) throw err
        if (err instanceof NonRetryableError) throw err
        if (accumulator.hasEmittedAny()) throw err
        if (attempt >= MAX_RETRIES) throw err
        lastErr = err
        await new Promise((r) => setTimeout(r, backoff(attempt)))
      }
    }
    throw lastErr ?? new Error("chatStreaming failed without specific error")
  }

  private toTokenUsage(u?: OpenAiUsage): TokenUsage | undefined {
    if (!u) return undefined
    const promptTokens = u.prompt_tokens ?? 0
    const completionTokens = u.completion_tokens ?? 0
    return {promptTokens, completionTokens, totalTokens: u.total_tokens ?? promptTokens + completionTokens}
  }

  private buildChatRequest(
    config: OpenAiChatConfig,
    openAiMessages: MessageLLM[],
    tools: Tool[] | undefined,
    toolChoice: ToolChoice | undefined,
    stream: boolean,
  ): ChatRequest {
    return {
      model: config.model,
      messages: openAiMessages,
      tools,
      tool_choice: toolChoice,
      stream,
      ...(stream ? {stream_options: {include_usage: true}} : {}),
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
  }

  private convertMessages(messages: MessageLLM[], model: string): MessageLLM[] {
    const needsReasoningContent = /deepseek-reasoner/i.test(model)

    logger.debug(logger.CONTEXT.AI, "Converting messages to OpenAI format", {model, messagesCount: messages.length})
    return messages.map((msg) => {
      const message: MessageLLM = {
        role: msg.role,
        content: msg.content || null,
      }

      if (notUndefined(msg.reasoning_content)) {
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

    if (notUndefined(msg.reasoning_content)) {
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
