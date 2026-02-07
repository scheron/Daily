import type {LocalModelId, LocalRuntimeParams} from "@shared/types/ai"

export type ModelManifestEntry = {
  id: LocalModelId
  title: string
  description: string
  sizeBytes: number
  requirements: {ramGb: number; diskGb: number}
  ggufUrl: string
  ggufFilename: string
  serverArgs: Required<Pick<LocalRuntimeParams, "ctx" | "gpuLayers" | "temperature">>
  recommended?: boolean
}

export type ServerBinaryEntry = {
  version: string
  macos: {
    arm64: {url: string; size: number}
    x64: {url: string; size: number}
  }
}

export const MODEL_MANIFEST: ModelManifestEntry[] = [
  {
    id: "daily-local-fast",
    title: "Fast (1.5B)",
    description: "Lightweight and quick, best for simple tasks",
    sizeBytes: 1_100_000_000,
    requirements: {ramGb: 4, diskGb: 2},
    ggufUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
    ggufFilename: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    serverArgs: {ctx: 4096, gpuLayers: 99, temperature: 0.3},
  },
  {
    id: "daily-local-balanced",
    title: "Balanced (8B)",
    description: "Good balance of speed and quality, strong tool calling",
    sizeBytes: 4_920_000_000,
    requirements: {ramGb: 8, diskGb: 6},
    recommended: true,
    ggufUrl: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    ggufFilename: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    serverArgs: {ctx: 4096, gpuLayers: 99, temperature: 0.3},
  },
  {
    id: "daily-local-quality",
    title: "Quality (14B)",
    description: "Highest quality, requires more resources",
    sizeBytes: 8_990_000_000,
    requirements: {ramGb: 16, diskGb: 10},
    ggufUrl: "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf",
    ggufFilename: "Qwen2.5-14B-Instruct-Q4_K_M.gguf",
    serverArgs: {ctx: 4096, gpuLayers: 99, temperature: 0.3},
  },
]

export const SERVER_BINARY: ServerBinaryEntry = {
  version: "b5200",
  macos: {
    arm64: {
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b5200/llama-b5200-bin-macos-arm64.zip",
      size: 50_000_000,
    },
    x64: {
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b5200/llama-b5200-bin-macos-x64.zip",
      size: 50_000_000,
    },
  },
}

export function getManifestEntry(modelId: LocalModelId): ModelManifestEntry | undefined {
  return MODEL_MANIFEST.find((m) => m.id === modelId)
}
