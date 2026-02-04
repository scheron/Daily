import type {AIConfig, AIProvider} from "@shared/types/ai"

export function getProviderConfig(provider: AIProvider, config: AIConfig): AIConfig["openai"] | AIConfig["local"] {
  return provider === "openai" ? config.openai : config.local
}
