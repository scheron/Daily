import type {MessageLLM, Tool} from "@/ai/types"

export type ChatSamplingParams = {
  temperature?: number
  top_p?: number
  top_k?: number
  max_tokens?: number
  repeat_penalty?: number
  repeat_last_n?: number
  seed?: number
}

export type ChatRequest = {
  model: string
  messages: MessageLLM[]
  tools?: Tool[]
  stream?: boolean
} & ChatSamplingParams

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
} & ChatSamplingParams
