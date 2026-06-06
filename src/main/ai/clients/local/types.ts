import type {LocalModelDownloadProgress, LocalModelId, LocalModelInfo, LocalRuntimeParams} from "@shared/types/ai"

export type ModelTier = "fast" | "balanced" | "quality"

export type ModelManifestEntry = {
  id: LocalModelId
  title: string
  description: string
  tier: ModelTier
  sizeBytes: number
  requirements: {ramGb: number; diskGb: number}
  ggufUrl: string
  ggufFilename: string
  sha256: string | null
  serverArgs: Required<Pick<LocalRuntimeParams, "ctx" | "gpuLayers" | "temperature">> &
    Partial<
      Pick<
        LocalRuntimeParams,
        | "topP"
        | "topK"
        | "minP"
        | "repeatPenalty"
        | "repeatLastN"
        | "presencePenalty"
        | "frequencyPenalty"
        | "dryMultiplier"
        | "dryBase"
        | "dryAllowedLength"
        | "dryPenaltyLastN"
      >
    >
  accuracy: number | null
  recommended?: boolean
}

export interface ILocalModelService {
  init(): Promise<void>
  getEntry(modelId: LocalModelId): ModelManifestEntry | undefined
  getCatalog(): ReadonlyArray<ModelManifestEntry>
  isInstalled(modelId: LocalModelId): Promise<boolean>
  getModelPath(modelId: LocalModelId): string
  listModels(): Promise<LocalModelInfo[]>
  downloadModel(modelId: LocalModelId, onProgress: (progress: LocalModelDownloadProgress) => void): Promise<boolean>
  cancelDownload(modelId: LocalModelId): Promise<boolean>
  deleteModel(modelId: LocalModelId): Promise<boolean>
  getDiskUsage(): Promise<{total: number; models: Record<string, number>}>
}
