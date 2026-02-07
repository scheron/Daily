import type {AIConfig} from "@shared/types/ai"
import type {MessageLLM, Tool} from "../types"

export interface IAIProvider {
  updateConfig(config: AIConfig | null): void
  checkConnection(): Promise<boolean>
  listModels(): Promise<string[]>
  chat(messages: MessageLLM[], tools?: Tool[], signal?: AbortSignal): Promise<{message: MessageLLM; done: boolean}>
  dispose?(): Promise<void>
}
