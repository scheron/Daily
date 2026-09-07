export type AIProvider = "openai" | "local"
export type LocalModelId = string

export type UnloadModelTime = "never" | "5m" | "15m" | "30m"

export type AIConfig = {
  enabled: boolean
  provider: AIProvider

  /** OpenAI compatible provider (DeepSeek, OpenAI, Groq, etc.) */
  openai: {
    /** Model name */
    model: string
    /** API URL */
    baseUrl: string
    /** API Key */
    apiKey: string
    /** Cached list of models fetched from provider */
    availableModels?: string[]
  } | null

  /** Local llama.cpp */
  local: {
    /** One of curated models from manifest */
    model: LocalModelId
    /** Optional: let user override defaults in advanced settings */
    params?: LocalRuntimeParams
    /** Cached list of models fetched from local provider */
    availableModels?: string[]
    /** When to unload the model from RAM after inactivity. Default "15m". */
    unloadModel?: UnloadModelTime
  } | null

  /**
   * Web access (read a specific URL) is always available to the agent.
   * `autoApprove` lets read_url run without a per-fetch confirmation card.
   * null / false == confirm every fetch (default).
   */
  webAccess: {
    autoApprove: boolean
  } | null
}

export type LocalRuntimeParams = {
  /** Context length (tokens). Default from manifest. */
  ctx?: number

  /** Temperature. Default from manifest. */
  temperature?: number

  /** Top-p / Top-k / Min-p. */
  topP?: number
  topK?: number
  minP?: number

  /** Max tokens to generate. */
  maxTokens?: number

  /** Repeat penalty family (llama.cpp supports these). */
  repeatPenalty?: number
  repeatLastN?: number

  /** OpenAI-style penalties. */
  presencePenalty?: number
  frequencyPenalty?: number

  /** DRY (Don't Repeat Yourself) sampler. Catches token-sequence loops. */
  dryMultiplier?: number
  dryBase?: number
  dryAllowedLength?: number
  dryPenaltyLastN?: number

  /** Seed for reproducibility */
  seed?: number

  /**
   * GPU layers (Metal). 0 = CPU only.
   * -1 to mean "auto/max".
   */
  gpuLayers?: number

  /**
   * Threads for CPU inference.
   * On macOS default to (logical cores - 2), but keep overrideable.
   */
  threads?: number
}
