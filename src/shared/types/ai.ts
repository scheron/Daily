export type AIProvider = "openai" | "local"
export type LocalModelId = string

export type UnloadModelTime = "never" | "5m" | "15m" | "30m"

/** A known LLM: display label, context window, and (remote-only) endpoint + provider. */
export type LlmModelInfo = {
  label: string
  contextWindow: number
  /** Remote API base URL; absent for local models. */
  url?: string
  /** Remote provider label (e.g. "OpenAI"); absent for local models. */
  provider?: string
}

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

/** Token accounting for a request (prompt) and its generation (completion). */
export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type AIMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  toolCalls?: Array<{name: string; result: string}>
  segments?: AgentMessageSegment[]
  usage?: TokenUsage
  status?: "streaming" | "complete" | "cancelled" | "failed"
  error?: string
}

export type AIResponse = {
  success: boolean
  message?: AIMessage
  error?: string
}

/**
 * The structured object the renderer receives when a destructive tool call
 * is awaiting confirmation. The internal `PendingConfirmation` (in main)
 * carries an additional `resolve` callback and timeout handle that cannot
 * cross the IPC boundary — only this serializable subset goes to the
 * renderer.
 */
export type PendingToolConfirmation = {
  id: string
  toolName: string
  /** Short verb-phrase ("Delete task", "Permanently delete task"). */
  title: string
  /** Single-line description ("Move 'buy milk' to trash"). */
  summary: string
  /** Optional supplementary lines ("Task ID: abc123"). */
  details?: string[]
  createdAt: number
}

/**
 * Live progress events emitted by the agent loop. The renderer subscribes
 * via `ai:on-event` to drive richer status UI ("calling LLM…", "running
 * create_task…"). Tool parameters and full LLM messages are intentionally
 * NOT included — events stay small and free of user-content leakage.
 */
export type AIEvent =
  | {type: "turn_started"; turnId: string; userMessage: string; startedAt: number}
  | {type: "model_requested"; turnId: string; iteration: number}
  | {type: "model_responded"; turnId: string; iteration: number; hasToolCalls: boolean}
  | {type: "tool_started"; turnId: string; toolCallId: string; toolName: string; label?: string}
  | {type: "tool_finished"; turnId: string; toolCallId: string; toolName: string; success: boolean; summary: string}
  | {type: "turn_finished"; turnId: string; finalMessage: string; finishedAt: number; usage?: TokenUsage}
  | {type: "turn_failed"; turnId: string; error: string; finishedAt: number}
  | {type: "turn_cancelled"; turnId: string; finishedAt: number}
  | {type: "model_content_delta"; turnId: string; iteration: number; text: string}
  | {type: "model_reasoning_delta"; turnId: string; iteration: number; text: string}

export type AgentMessageSegment =
  | {kind: "reasoning"; text: string; durationMs?: number; startedAt?: number}
  | {kind: "tool"; toolCallId: string; name: string; status: "running" | "done"; success?: boolean; summary?: string; label?: string}

/**
 * Renderer-safe summary of a persisted AgentTurn. Used by `ai:get-current-session`
 * to restore the chat view on app start. The full `AgentStep[]` array stays in
 * main; the renderer only needs enough to draw a chat message bubble.
 */
export type AgentTurnSnapshot = {
  id: string
  userMessage: string
  finalMessage: string | null
  startedAt: number
  finishedAt: number | null
  status: "running" | "completed" | "failed" | "cancelled" | "waiting_confirmation"
  /** Pairs derived from the turn's tool-call/tool-result steps. */
  toolCalls: Array<{name: string; result: string}>
  segments?: AgentMessageSegment[]
  /** Token usage accumulated across the turn's LLM calls. */
  usage?: TokenUsage
  error?: string
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

export type LocalRuntimeState =
  | {status: "not_installed"}
  | {status: "downloading"; modelId: LocalModelId; progress: number}
  | {status: "installed"; modelId: LocalModelId}
  | {status: "starting"; modelId: LocalModelId}
  | {status: "running"; modelId: LocalModelId; port: number; pid?: number}
  | {status: "error"; modelId?: LocalModelId; message: string; details?: string}

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
      tools: LocalToolingMode
      json: "strict" | "loose"
    }
  }>
}

export type LocalToolingMode = "compat" | "native"

export type LocalConfig = {
  modelId: LocalModelId
  toolingMode?: LocalToolingMode
  params?: LocalRuntimeParams
}

export type LocalModelInfo = {
  id: LocalModelId
  title: string
  description: string
  sizeBytes: number
  requirements: {ramGb: number; diskGb: number}
  installed: boolean
  recommended?: boolean
  /** Set when a `.download` partial file exists for an uninstalled model. */
  partialBytes?: number
  /** Catalog-provided rough quality score (0..1). */
  accuracy?: number
  /** Catalog-provided tier label (fast / balanced / quality). */
  tier?: "fast" | "balanced" | "quality"
}

export type DownloadPhase = "downloading" | "verifying"

export type LocalModelDownloadProgress = {
  modelId: LocalModelId
  percent: number
  downloadedBytes: number
  totalBytes: number
  phase: DownloadPhase
}
