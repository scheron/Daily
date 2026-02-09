import type {LocalModelId} from "@shared/types/ai"
import type {ModelManifestEntry} from "../types"

export const MODEL_MANIFEST: ModelManifestEntry[] = [
  {
    id: "daily-fast",
    title: "Minimal (3B)",
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
    title: "Balanced (8B)",
    description: "Good balance of speed and quality, strong tool calling",
    promptTier: "medium",
    sizeBytes: 4_920_000_000,
    requirements: {ramGb: 8, diskGb: 6},
    recommended: true,
    ggufUrl: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    ggufFilename: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    serverArgs: {ctx: 8192, gpuLayers: 99, temperature: 0.3},
  },
  {
    id: "daily-quality",
    title: "Quality (14B)",
    description: "Highest quality, requires more resources",
    promptTier: "large",
    sizeBytes: 8_990_000_000,
    requirements: {ramGb: 16, diskGb: 10},
    ggufUrl: "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf",
    ggufFilename: "Qwen2.5-14B-Instruct-Q4_K_M.gguf",
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
