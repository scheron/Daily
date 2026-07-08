import type {ModelManifestEntry} from "../types"

const RESERVED_FLAGS = new Set(["--model", "-m", "--port", "--host"])

/**
 * Assembles the llama-server argv: fixed defaults, then per-model `launchArgs`,
 * then the app-controlled `--model`/`--port`/`--host` (appended last so a catalog
 * entry can never repoint the model file, port, or bind host).
 *
 * @example
 * buildLlamaArgs({modelPath: "/m/x.gguf", port: 8080, host: "127.0.0.1", params: {ctx: 4096, gpuLayers: 99, temperature: 0.6}})
 */
export function buildLlamaArgs(opts: {modelPath: string; port: number; host: string; params: ModelManifestEntry["serverArgs"]}): string[] {
  const {modelPath, port, host, params} = opts
  const extra = stripReserved(params.launchArgs ?? [])

  return [
    "--ctx-size",
    String(params.ctx),
    "--n-gpu-layers",
    String(params.gpuLayers),
    "--jinja",
    "--flash-attn",
    "on",
    "--cont-batching",
    "--mlock",
    "--no-warmup",
    "--cache-reuse",
    "256",
    "--parallel",
    "1",
    "--cache-type-k",
    "q8_0",
    "--cache-type-v",
    "q8_0",
    ...extra,
    "--model",
    modelPath,
    "--port",
    String(port),
    "--host",
    host,
  ]
}

function stripReserved(args: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (RESERVED_FLAGS.has(args[i].split("=")[0])) {
      if (!args[i].includes("=")) i++
      continue
    }
    out.push(args[i])
  }
  return out
}
