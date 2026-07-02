import type {MessageLLM, Tool} from "@/ai/types"

export type ChatSamplingParams = {
  temperature?: number
  top_p?: number
  top_k?: number
  min_p?: number
  max_tokens?: number
  repeat_penalty?: number
  repeat_last_n?: number
  presence_penalty?: number
  frequency_penalty?: number
  /** DRY (Don't Repeat Yourself) sampler — catches repeating token sequences. 0 to disable, 0.8 is a sensible default. */
  dry_multiplier?: number
  dry_base?: number
  /** Minimum sequence length before DRY kicks in (default 2). */
  dry_allowed_length?: number
  /** Lookback window for DRY (default same as ctx). */
  dry_penalty_last_n?: number
  seed?: number
}

export type ChatRequest = {
  model: string
  messages: MessageLLM[]
  tools?: Tool[]
  tool_choice?: "auto" | "required" | "none"
  stream?: boolean
  stream_options?: {include_usage?: boolean}
} & ChatSamplingParams

/** Raw OpenAI-style usage returned by the provider. */
export type OpenAiUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export type OpenAiChatResponse = {
  choices: Array<{
    message: MessageLLM
    finish_reason?: string
  }>
  usage?: OpenAiUsage
}

export type OpenAiConnectionConfig = {
  baseUrl: string
  apiKey: string
}

export type OpenAiChatConfig = OpenAiConnectionConfig & {
  model: string
} & ChatSamplingParams
