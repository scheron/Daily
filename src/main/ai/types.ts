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

export type ChatRequest = {
  model: string
  messages: MessageLLM[]
  tools?: Tool[]
  stream?: boolean
}

export type OllamaChatResponse = {
  model: string
  message: MessageLLM
  done: boolean
  done_reason?: string
}

export type OpenAiChatResponse = {
  id: string
  model: string
  choices: Array<{
    message: MessageLLM
    finish_reason: string
  }>
}

export type StreamChunk = {
  model: string
  message: {
    role: string
    content: string
  }
  done: boolean
}
