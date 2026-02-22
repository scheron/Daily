import type {LocalModelId} from "@shared/types/ai"
import type {ModelManifestEntry} from "../types"

export const MODEL_MANIFEST: ModelManifestEntry[] = [
  {
    id: "daily-fast",
    title: "Minimal",
    description: "Stronger baseline for everyday agent tasks with tools",
    promptTier: "tiny",
    sizeBytes: 2_080_000_000,
    requirements: {ramGb: 6, diskGb: 3},
    ggufUrl: "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    ggufFilename: "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    serverArgs: {ctx: 4096, gpuLayers: 99, temperature: 0.3},
  },
  {
    id: "daily-balanced",
    title: "Balanced",
    description: "Balanced speed/quality profile",
    promptTier: "medium",
    sizeBytes: 4_370_000_000,
    requirements: {ramGb: 8, diskGb: 6},
    recommended: true,
    ggufUrl: "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    ggufFilename: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    serverArgs: {ctx: 8192, gpuLayers: 99, temperature: 0.3},
  },
  {
    id: "daily-quality",
    title: "Quality",
    description: "Highest quality local profile, requires high memory and storage",
    promptTier: "large",
    sizeBytes: 26_440_000_000,
    requirements: {ramGb: 32, diskGb: 30},
    ggufUrl: "https://huggingface.co/TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF/resolve/main/mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf",
    ggufFilename: "mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf",
    serverArgs: {ctx: 8192, gpuLayers: 99, temperature: 0.3},
  },
]

export const SERVER_BINARY = {
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
} as const

export function getManifestEntry(modelId: LocalModelId): ModelManifestEntry | undefined {
  return MODEL_MANIFEST.find((m) => m.id === modelId)
}
