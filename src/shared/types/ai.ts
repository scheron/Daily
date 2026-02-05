export type AIProvider = "openai" | "local"
export type LocalModelId = "daily-local-fast" | "daily-local-balanced" | "daily-local-quality"

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
  } | null

  /** Local llama.cpp */
  local: {
    /** One of curated models from manifest */
    model: LocalModelId
    /** Optional: let user override defaults in advanced settings */
    params?: LocalRuntimeParams
  } | null
}

export type AIMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  toolCalls?: Array<{name: string; result: string}>
}

export type AIResponse = {
  success: boolean
  message?: AIMessage
  error?: string
}

export type LocalRuntimeParams = {
  /** Context length (tokens). Default from manifest. */
  ctx?: number

  /** Temperature. Default from manifest. */
  temperature?: number

  /** Top-p / Top-k. */
  topP?: number
  topK?: number

  /** Max tokens to generate. */
  maxTokens?: number

  /** Repeat penalty family (llama.cpp supports these). */
  repeatPenalty?: number
  repeatLastN?: number

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

/** Local runtime state
 * Useful for UI to show the state of the local runtime
 */
export type LocalRuntimeState =
  | {status: "not_installed"}
  | {status: "downloading"; modelId: LocalModelId; progress: number}
  | {status: "installed"; modelId: LocalModelId}
  | {status: "starting"; modelId: LocalModelId}
  | {status: "running"; modelId: LocalModelId; port: number; pid?: number}
  | {status: "error"; modelId?: LocalModelId; message: string; details?: string}

/** Local model manifest (llama.cpp) */
export type LocalModelManifest = {
  version: number
  models: Array<{
    id: LocalModelId
    title: string
    sizeBytes: number
    requirements: {ramGb: number; diskGb: number}
    files: Array<{
      os: "macos"
      cpu: "arm64" | "x64"
      url: string
      sha256: string
    }>
    serverDefaults: LocalRuntimeParams
    capabilities: {
      /** How we do tools: compat loop vs native tools */
      tools: LocalToolingMode
      json: "strict" | "loose"
    }
  }>
}

export type LocalToolingMode = "compat" | "native"

export type LocalConfig = {
  modelId: LocalModelId
  toolingMode?: LocalToolingMode // default "compat"
  params?: LocalRuntimeParams
}
