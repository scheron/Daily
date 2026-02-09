import type {MessageLLM, Tool} from "@/ai/types"

export type ChatRequest = {
  model: string
  messages: MessageLLM[]
  tools?: Tool[]
  stream?: boolean
}

export type OpenAiChatResponse = {
  choices: Array<{
    message: MessageLLM
  }>
}

export type OpenAiConnectionConfig = {
  baseUrl: string
  apiKey: string
}

export type OpenAiChatConfig = OpenAiConnectionConfig & {
  model: string
}
