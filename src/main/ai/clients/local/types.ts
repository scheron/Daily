import type {LocalModelDownloadProgress, LocalModelId, LocalModelInfo, LocalRuntimeParams} from "@shared/types/ai"

export type ModelManifestEntry = {
  id: LocalModelId
  title: string
  description: string
  promptTier: "tiny" | "medium" | "large"
  sizeBytes: number
  requirements: {ramGb: number; diskGb: number}
  ggufUrl: string
  ggufFilename: string
  serverArgs: Required<Pick<LocalRuntimeParams, "ctx" | "gpuLayers" | "temperature">>
  recommended?: boolean
}

export interface ILocalModelService {
  init(): Promise<void>
  isInstalled(modelId: LocalModelId): Promise<boolean>
  getModelPath(modelId: LocalModelId): string
  listModels(): Promise<LocalModelInfo[]>
  downloadModel(modelId: LocalModelId, onProgress: (progress: LocalModelDownloadProgress) => void): Promise<boolean>
  cancelDownload(modelId: LocalModelId): Promise<boolean>
  deleteModel(modelId: LocalModelId): Promise<boolean>
  getDiskUsage(): Promise<{total: number; models: Record<string, number>}>
}
