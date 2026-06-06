// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {AIController} from "@main/ai/AIController"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

vi.mock("@main/ai/clients/local/core/LocalModelService", () => ({
  LocalModelService: class {
    async init() {}
    getEntry() {
      return undefined
    }
    getCatalog() {
      return []
    }
    async isInstalled() {
      return true
    }
    async download() {}
    cancelDownload() {}
    async deleteModel() {}
    async listInstalled() {
      return []
    }
  },
}))

function makeStorage(unloadModel = "15m") {
  return {
    loadSettings: vi.fn(async () => ({
      ai: {enabled: true, provider: "local", local: {model: "qwen3-4b-instruct", unloadModel}},
      branch: {activeId: "main"},
    })),
    saveSettings: vi.fn(async () => {}),
    appendAiTurn: vi.fn(async () => {}),
    archiveActiveAiSession: vi.fn(async () => false),
    getActiveAiSessionTurns: vi.fn(async () => []),
  }
}

describe("AIController idle unload", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("stops the local server after the configured idle window elapses", async () => {
    const ctrl = new AIController(makeStorage("5m") as any)
    await ctrl.init()

    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.server, "isRunning").mockReturnValue(true)
    const stop = vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    ;(ctrl as any).lastActivityAt = Date.now()

    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)

    expect(stop).toHaveBeenCalled()
    await ctrl.dispose()
  })

  it("does not stop when unloadModel === 'never'", async () => {
    const ctrl = new AIController(makeStorage("never") as any)
    await ctrl.init()
    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.server, "isRunning").mockReturnValue(true)
    const stop = vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    ;(ctrl as any).lastActivityAt = Date.now() - 60 * 60 * 1000 // 1h ago

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

    expect(stop).not.toHaveBeenCalled()
    await ctrl.dispose()
  })
})

describe("AIController idle unload — first-connection race", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("does not immediately stop the server after a delayed first checkConnection", async () => {
    const storage = {
      loadSettings: vi.fn(async () => ({
        ai: {enabled: true, provider: "local", local: {model: "qwen3-4b-instruct", unloadModel: "15m"}},
        branch: {activeId: "main"},
      })),
      saveSettings: vi.fn(async () => {}),
      appendAiTurn: vi.fn(async () => {}),
      archiveActiveAiSession: vi.fn(async () => false),
      getActiveAiSessionTurns: vi.fn(async () => []),
    }

    const ctrl = new AIController(storage as any)
    await ctrl.init()

    // Simulate 20 minutes of idle time AFTER construction before the user opens the panel.
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000)

    const localClient = (ctrl as any).localClient
    vi.spyOn(localClient.server, "isRunning").mockReturnValue(true)
    const stop = vi.spyOn(localClient.server, "stop").mockResolvedValue(undefined)
    // Stub the underlying provider checkConnection to return true without doing real work.
    vi.spyOn(localClient, "checkConnection").mockResolvedValue(true)

    await ctrl.checkConnection()

    // Advance another minute. checkIdle fires, but should NOT stop the server because
    // checkConnection just bumped lastActivityAt.
    await vi.advanceTimersByTimeAsync(60 * 1000)

    expect(stop).not.toHaveBeenCalled()
    await ctrl.dispose()
  })
})
