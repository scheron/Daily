import type {AIConfig} from "@daily/protocol"
import type {ToolInputSchema} from "@daily/tools"
import type {TokenUsage} from "@shared/types/ai"

/** One part of a message's content: plain text, or an image a tool result carried (`get_attachment`'s own bytes). */
export type ContentPart = {type: "text"; text: string} | {type: "image_url"; image_url: {url: string}}

export type MessageLLM = {
  id?: string
  role: "system" | "user" | "assistant" | "tool"
  content: string | ContentPart[] | null
  reasoning_content?: string | null
  timestamp?: number
  tool_calls?: ToolCallLLM[]
  tool_call_id?: string
}

export type ToolCallLLM = {
  id: string
  type: "function"
  function: {
    name: string
    /* JSON string in OpenAI format; object in Local LLM */
    arguments: Record<string, unknown> | string
  }
}

export type Tool = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: ToolInputSchema
  }
}

export type ToolChoice = "auto" | "required" | "none"

export type ChatStreamDelta = {kind: "content"; text: string} | {kind: "reasoning"; text: string}

export type ChatStreamCallbacks = {
  onDelta?: (delta: ChatStreamDelta) => void
}

export interface IAiClient {
  checkConnection(): Promise<boolean>
  listModels(): Promise<string[]>
  updateConfig(config: AIConfig | null): void
  chat(
    messages: MessageLLM[],
    tools?: Tool[],
    signal?: AbortSignal,
    toolChoice?: ToolChoice,
    callbacks?: ChatStreamCallbacks,
  ): Promise<{message: MessageLLM; done: boolean; usage?: TokenUsage}>
  dispose?(): Promise<void>
}
