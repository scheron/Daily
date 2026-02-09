import type {AIConfig} from "@shared/types/ai"

export type PromptTier = "tiny" | "medium" | "large"

export type MessageLLM = {
  id?: string
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
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

export interface IAiClient {
  updateConfig(config: AIConfig | null): void
  checkConnection(): Promise<boolean>
  listModels(): Promise<string[]>
  chat(messages: MessageLLM[], tools?: Tool[], signal?: AbortSignal): Promise<{message: MessageLLM; done: boolean}>
  dispose?(): Promise<void>
}
