export const AI_CONFIG = {
  enabled: false,
  provider: "openai",
  runtime: {
    openAiCompatible: {
      modelsLimitCount: 20,
      connectionTimeoutMs: 10_000,
    },
    local: {
      host: "127.0.0.1",
      apiPath: "/v1",
      apiKey: "no-key",
      catalogUrl: "https://raw.githubusercontent.com/scheron/Daily/main/resources/models.json",
      catalogTimeoutMs: 10_000,
    },
  },
  openai: {
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
  },
  local: {
    model: "qwen3.5-4b",
  },
} as const
