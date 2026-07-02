import type {LlmModelInfo, UnloadModelTime} from "../types/ai"

/**
 * Known LLM models keyed by id (local) or name (remote). Single source for
 * model labels, context windows, and remote endpoints — drives the context-fill
 * ring and the remote provider list. Unknown models resolve to `null` windows.
 */
export const LLM_MODELS: Record<string, LlmModelInfo> = {
  // Local
  "qwen3.5-4b": {label: "Qwen3.5 4B", contextWindow: 8192},
  "qwen3.5-9b": {label: "Qwen3.5 9B", contextWindow: 8192},
  "qwen3.5-27b": {label: "Qwen3.5 27B", contextWindow: 16384},
  "glm-4-9b": {label: "GLM-4 9B", contextWindow: 8192},
  "mistral-nemo-12b": {label: "Mistral Nemo 12B", contextWindow: 8192},
  "llama-3.1-8b": {label: "Llama 3.1 8B", contextWindow: 8192},
  // Remote
  "gpt-4o": {label: "GPT-4o", contextWindow: 128000, url: "https://api.openai.com/v1", provider: "OpenAI"},
  "gpt-4o-mini": {label: "GPT-4o mini", contextWindow: 128000, url: "https://api.openai.com/v1", provider: "OpenAI"},
  "gpt-4.1": {label: "GPT-4.1", contextWindow: 1000000, url: "https://api.openai.com/v1", provider: "OpenAI"},
  "gpt-4.1-mini": {label: "GPT-4.1 mini", contextWindow: 1000000, url: "https://api.openai.com/v1", provider: "OpenAI"},
  "deepseek-chat": {label: "DeepSeek Chat", contextWindow: 65536, url: "https://api.deepseek.com/v1", provider: "DeepSeek"},
  "deepseek-reasoner": {label: "DeepSeek Reasoner", contextWindow: 65536, url: "https://api.deepseek.com/v1", provider: "DeepSeek"},
  "deepseek-v4-flash": {label: "DeepSeek V4 Flash", contextWindow: 131072, url: "https://api.deepseek.com/v1", provider: "DeepSeek"},
  "deepseek-v4-pro": {label: "DeepSeek V4 Pro", contextWindow: 131072, url: "https://api.deepseek.com/v1", provider: "DeepSeek"},
}

/** Distinct remote provider endpoints, derived from {@link LLM_MODELS}. */
export const REMOTE_API_PROVIDERS = (() => {
  const seen = new Map<string, string>()
  for (const model of Object.values(LLM_MODELS)) {
    if (model.url && model.provider && !seen.has(model.url)) seen.set(model.url, model.provider)
  }
  return Array.from(seen, ([value, label]) => ({value, label}))
})()

/** Idle durations (ms; `null` = never) after which a local model is unloaded from RAM. */
export const UNLOAD_MODEL_TIME: Record<UnloadModelTime, number | null> = {
  never: null,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
}
