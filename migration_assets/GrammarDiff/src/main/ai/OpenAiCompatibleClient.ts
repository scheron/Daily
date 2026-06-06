import {logger} from "@/utils/logger"

export type ChatMessage = {role: "system" | "user" | "assistant"; content: string}

export type ChatOptions = {
  baseUrl: string
  apiKey: string
  model: string
  temperature?: number
  topP?: number
  topK?: number
  maxTokens?: number
  repeatPenalty?: number
  repeatLastN?: number
  seed?: number
  disableThinking?: boolean
}

type ChatResponse = {
  choices?: Array<{message?: {role?: string; content?: string}}>
}

export class OpenAiCompatibleClient {
  async chat(messages: ChatMessage[], opts: ChatOptions, signal?: AbortSignal): Promise<string> {
    const url = `${opts.baseUrl}/chat/completions`
    const body: Record<string, unknown> = {
      model: opts.model,
      messages,
      stream: false,
    }
    if (opts.temperature !== undefined) body.temperature = opts.temperature
    if (opts.topP !== undefined) body.top_p = opts.topP
    if (opts.topK !== undefined) body.top_k = opts.topK
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens
    if (opts.repeatPenalty !== undefined) body.repeat_penalty = opts.repeatPenalty
    if (opts.repeatLastN !== undefined) body.repeat_last_n = opts.repeatLastN
    if (opts.seed !== undefined) body.seed = opts.seed
    if (opts.disableThinking) body.chat_template_kwargs = {enable_thinking: false}

    logger.info(logger.CONTEXT.AI, "Chat request", {url, model: opts.model, messages: messages.length})

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Chat request failed: HTTP ${response.status} ${text}`.trim())
    }

    const payload = (await response.json()) as ChatResponse
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== "string") throw new Error("Chat response missing choices[0].message.content")
    return content.trim()
  }
}
