export type ModelId = string

export type RuntimeParams = {
  ctx?: number
  gpuLayers?: number
  temperature?: number
  topK?: number
  topP?: number
  maxTokens?: number
  repeatPenalty?: number
  repeatLastN?: number
  seed?: number
}

export type AIConfig = {
  model: ModelId | null
  params?: RuntimeParams
}

export type RuntimeState =
  | {status: "not_installed"}
  | {status: "downloading"; modelId: ModelId; progress: number}
  | {status: "installed"; modelId: ModelId}
  | {status: "starting"; modelId: ModelId}
  | {status: "running"; modelId: ModelId; port: number; pid?: number}
  | {status: "error"; modelId?: ModelId; message: string}

export type ModelInfo = {
  id: ModelId
  title: string
  description: string
  sizeBytes: number
  requirements: {ramGb: number; diskGb: number}
  installed: boolean
  partialBytes?: number
  recommended?: boolean
  accuracy: number
  speed: number
}

export type DownloadPhase = "downloading" | "verifying"

export type ModelDownloadProgress = {
  modelId: ModelId
  percent: number
  downloadedBytes: number
  totalBytes: number
  phase: DownloadPhase
}
