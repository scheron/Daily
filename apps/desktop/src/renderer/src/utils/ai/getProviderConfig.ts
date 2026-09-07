import type {AIConfig, AIProvider} from "@daily/protocol"

export function getProviderConfig(provider: AIProvider, config: AIConfig): AIConfig["openai"] | AIConfig["local"] {
  return provider === "openai" ? config.openai : config.local
}
