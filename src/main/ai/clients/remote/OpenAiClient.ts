import {OpenAiCompatibleClient} from "@/ai/clients/common/OpenAiCompatibleClient"

import type {AIConfig} from "@shared/types/ai"

export class RemoteAiClient extends OpenAiCompatibleClient {
  private config: AIConfig["openai"] | null = null

  updateConfig(config: AIConfig | null): void {
    this.config = config?.openai ?? null
  }

  protected getClientName(): string {
    return "OpenAI"
  }

  protected getConnectionConfig() {
    if (!this.config?.apiKey || !this.config?.baseUrl) return null
    return {baseUrl: this.config.baseUrl, apiKey: this.config.apiKey}
  }

  protected getChatConfig() {
    if (!this.config?.model || !this.config?.apiKey || !this.config.baseUrl) return null
    return {baseUrl: this.config.baseUrl, apiKey: this.config.apiKey, model: this.config.model}
  }
}
