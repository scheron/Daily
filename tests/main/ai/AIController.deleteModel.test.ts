// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {AIController} from "@main/ai/AIController"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

// LocalModelService.init() calls fsPaths.modelsCatalogPath() which needs electron app — stub it.
vi.mock("@main/ai/clients/local/core/LocalModelService", () => {
  return {
    LocalModelService: class {
      catalog: any[] = []
      async init() {}
      getEntry(_: string) {
        return undefined
      }
      getCatalog() {
        return []
      }
      async isInstalled(_: string) {
        return false
      }
      getModelPath(_: string) {
        return "/tmp/x"
      }
      async listModels() {
        return []
      }
      async downloadModel() {
        return true
      }
      async cancelDownload() {
        return true
      }
      async deleteModel(_: string) {
        return true
      }
      async getDiskUsage() {
        return {total: 0, models: {}}
      }
    },
  }
})

function makeStorage(selectedModel = "qwen3-4b-instruct") {
  return {
    loadSettings: vi.fn(async () => ({
      ai: {enabled: true, provider: "local", local: {model: selectedModel}},
      branch: {activeId: "main"},
    })),
    saveSettings: vi.fn(async () => {}),
    appendAiTurn: vi.fn(async () => {}),
    archiveActiveAiSession: vi.fn(async () => false),
    getActiveAiSessionTurns: vi.fn(async () => []),
  }
}

describe("AIController.deleteLocalModel", () => {
  it("stops the server when deleting the currently-running model", async () => {
    const storage = makeStorage("qwen3-4b-instruct")
    const ctrl = new AIController(storage as any)
    await ctrl.init()

    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.server, "getCurrentModelId").mockReturnValue("qwen3-4b-instruct")
    const unload = vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    const del = vi.spyOn(localClient.modelService, "deleteModel").mockResolvedValue(true)

    const ok = await ctrl.deleteLocalModel("qwen3-4b-instruct")

    expect(unload).toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith("qwen3-4b-instruct")
    expect(ok).toBe(true)
    expect(storage.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ai: expect.objectContaining({local: expect.objectContaining({model: null})})}),
    )

    await ctrl.dispose()
  })

  it("does NOT stop the server when deleting an inactive model", async () => {
    const storage = makeStorage("hermes-3-llama-3.1-8b")
    const ctrl = new AIController(storage as any)
    await ctrl.init()

    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.server, "getCurrentModelId").mockReturnValue("hermes-3-llama-3.1-8b")
    const stop = vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    vi.spyOn(localClient.modelService, "deleteModel").mockResolvedValue(true)

    await ctrl.deleteLocalModel("qwen3-4b-instruct")

    expect(stop).not.toHaveBeenCalled()
    await ctrl.dispose()
  })
})

describe("LocalClient.checkConnection dedup", () => {
  it("does not start the server twice when called concurrently", async () => {
    const storage = makeStorage("qwen3-4b-instruct")
    const ctrl = new AIController(storage as any)
    await ctrl.init()

    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.modelService, "isInstalled").mockResolvedValue(true)
    vi.spyOn(localClient.modelService, "getEntry").mockReturnValue({
      id: "qwen3-4b-instruct",
      ggufFilename: "x.gguf",
      serverArgs: {ctx: 1, gpuLayers: 1, temperature: 0.1},
    } as any)
    vi.spyOn(localClient.modelService, "getModelPath").mockReturnValue("/tmp/x.gguf")
    vi.spyOn(localClient.server, "ensureBinary").mockResolvedValue(undefined)
    const start = vi.spyOn(localClient.server, "start").mockResolvedValue(undefined)
    vi.spyOn(localClient.server, "isRunning").mockReturnValue(false)
    vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    vi.spyOn(localClient.server, "getPort").mockReturnValue(12345)
    vi.spyOn(localClient.server, "getState").mockReturnValue({status: "not_installed"})

    // Update internal config so checkConnection has a model selected
    localClient.updateConfig({
      enabled: true,
      provider: "local",
      openai: null,
      local: {model: "qwen3-4b-instruct"},
    })

    const [a, b] = await Promise.all([localClient.checkConnection(), localClient.checkConnection()])
    expect(start).toHaveBeenCalledTimes(1)
    expect(a !== undefined && b !== undefined).toBe(true)
    await ctrl.dispose()
  })
})
