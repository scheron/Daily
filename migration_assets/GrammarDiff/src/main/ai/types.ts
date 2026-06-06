import type {ModelDownloadProgress, ModelId, ModelInfo, RuntimeParams} from "@shared/types/ai"

export type ModelManifestEntry = {
  id: ModelId
  title: string
  description: string
  sizeBytes: number
  requirements: {ramGb: number; diskGb: number}
  ggufUrl: string
  ggufFilename: string
  sha256?: string
  serverArgs: Required<Pick<RuntimeParams, "ctx" | "gpuLayers" | "temperature">>
  recommended?: boolean
  disableThinking?: boolean
  accuracy: number
}

export interface IModelService {
  init(): Promise<void>
  getEntry(id: ModelId): ModelManifestEntry | undefined
  isInstalled(id: ModelId): Promise<boolean>
  getModelPath(id: ModelId): string
  listModels(): Promise<ModelInfo[]>
  downloadModel(id: ModelId, onProgress: (progress: ModelDownloadProgress) => void): Promise<boolean>
  cancelDownload(id: ModelId): Promise<boolean>
  deleteModel(id: ModelId): Promise<boolean>
  getDiskUsage(): Promise<{total: number; models: Record<string, number>}>
}
