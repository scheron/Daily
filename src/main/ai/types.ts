import type {AIConfig} from "@shared/types/ai"

export type MessageLLM = {
  id?: string
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
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
    parameters: {
      type: "object"
      properties: Record<string, {type: string; description?: string; enum?: string[]}>
      required?: string[]
    }
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
  ): Promise<{message: MessageLLM; done: boolean}>
  dispose?(): Promise<void>
}
