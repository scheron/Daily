import {describe, expect, it} from "vitest"

import {buildLlamaArgs} from "@main/ai/clients/local/core/llamaArgs"

const base = {modelPath: "/models/x.gguf", port: 8080, host: "127.0.0.1"}

describe("buildLlamaArgs", () => {
  it("includes fixed defaults and per-model ctx/gpuLayers", () => {
    const args = buildLlamaArgs({...base, params: {ctx: 4096, gpuLayers: 99, temperature: 0.6}})
    expect(args).toContain("--jinja")
    expect(args).toContain("--flash-attn")
    expect(args[args.indexOf("--ctx-size") + 1]).toBe("4096")
    expect(args[args.indexOf("--n-gpu-layers") + 1]).toBe("99")
  })

  it("appends launchArgs after the fixed defaults", () => {
    const args = buildLlamaArgs({
      ...base,
      params: {ctx: 4096, gpuLayers: 99, temperature: 0.6, launchArgs: ["--rope-scaling", "yarn"]},
    })
    const scale = args.indexOf("--rope-scaling")
    expect(scale).toBeGreaterThan(-1)
    expect(args[scale + 1]).toBe("yarn")
  })

  it("keeps --model/--port/--host app-controlled even if launchArgs tries to set them", () => {
    const args = buildLlamaArgs({
      ...base,
      params: {ctx: 4096, gpuLayers: 99, temperature: 0.6, launchArgs: ["--model", "/evil.gguf", "--port", "1"]},
    })
    expect(args[args.indexOf("--model") + 1]).toBe("/models/x.gguf")
    expect(args.filter((a) => a === "--model")).toHaveLength(1)
    expect(args[args.indexOf("--port") + 1]).toBe("8080")
    expect(args).not.toContain("/evil.gguf")
  })

  it("strips reserved flags in --flag=value equals-form too", () => {
    const args = buildLlamaArgs({
      ...base,
      params: {ctx: 4096, gpuLayers: 99, temperature: 0.6, launchArgs: ["--model=/evil.gguf", "--host=0.0.0.0", "--rope-scaling", "yarn"]},
    })
    expect(args).not.toContain("--model=/evil.gguf")
    expect(args).not.toContain("--host=0.0.0.0")
    expect(args[args.indexOf("--model") + 1]).toBe("/models/x.gguf")
    expect(args[args.indexOf("--host") + 1]).toBe("127.0.0.1")
    expect(args[args.indexOf("--rope-scaling") + 1]).toBe("yarn")
  })
})
