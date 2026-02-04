import {LogContext, logger} from "@/utils/logger"

import type {AIConfig} from "@shared/types/ai"

// TODO: Implement llama.cpp client
export class OllamaClient {
  constructor(private config: AIConfig["local"]) {}

  async checkConnection(): Promise<boolean> {
    // try {
    //   const response = await fetch(`${this.baseUrl}/api/tags`, {
    //     method: "GET",
    //     signal: AbortSignal.timeout(5000),
    //   })
    //   return response.ok
    // } catch {
    //   return false
    // }
  }

  async listModels(): Promise<string[]> {
    // try {
    //   const response = await fetch(`${this.baseUrl}/api/tags`)
    //   if (!response.ok) return []
    //   const data = (await response.json()) as {models?: Array<{name: string}>}
    //   return data.models?.map((m) => m.name) ?? []
    // } catch {
    //   return []
    // }
  }

  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    logger.debug(LogContext.AI, "Ollama chat request", {model: request.model, messagesCount: request.messages.length})

    // const response = await fetch(`${this.baseUrl}/api/chat`, {
    //   method: "POST",
    //   headers: {"Content-Type": "application/json"},
    //   body: JSON.stringify({...request, stream: false}),
    // })

    // if (!response.ok) {
    //   const error = await response.text()
    //   throw new Error(`Ollama error: ${error}`)
    // }

    // const result = (await response.json()) as OllamaChatResponse

    // logger.debug(LogContext.AI, "Ollama chat response", {
    //   hasToolCalls: !!result.message.tool_calls?.length,
    //   contentLength: result.message.content?.length ?? 0,
    // })

    // return result
  }

  async *chatStream(request: OllamaChatRequest, signal?: AbortSignal): AsyncGenerator<OllamaStreamChunk, OllamaChatResponse | null> {
    // logger.debug(LogContext.AI, "Ollama stream request", {model: request.model})
    // const response = await fetch(`${this.baseUrl}/api/chat`, {
    //   method: "POST",
    //   headers: {"Content-Type": "application/json"},
    //   body: JSON.stringify({...request, stream: true}),
    //   signal,
    // })
    // if (!response.ok) {
    //   const error = await response.text()
    //   throw new Error(`Ollama error: ${error}`)
    // }
    // const reader = response.body?.getReader()
    // if (!reader) {
    //   throw new Error("No response body")
    // }
    // const decoder = new TextDecoder()
    // let finalResponse: OllamaChatResponse | null = null
    // try {
    //   while (true) {
    //     const {done, value} = await reader.read()
    //     if (done) break
    //     const text = decoder.decode(value, {stream: true})
    //     const lines = text.split("\n").filter(Boolean)
    //     for (const line of lines) {
    //       try {
    //         const chunk = JSON.parse(line) as OllamaStreamChunk
    //         if (chunk.done) {
    //           finalResponse = chunk as unknown as OllamaChatResponse
    //         } else {
    //           yield chunk
    //         }
    //       } catch {
    //         // Skip invalid JSON
    //       }
    //     }
    //   }
    // } finally {
    //   reader.releaseLock()
    // }
    // return finalResponse
  }
}
