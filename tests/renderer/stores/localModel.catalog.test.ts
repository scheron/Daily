// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {useLocalModelStore} from "@renderer/stores/ai/localModel.store"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

let bridge: Record<string, any>

beforeEach(() => {
  bridge = mockBridgeIPC({
    "ai:local-list-models": vi.fn().mockResolvedValue([]),
    "ai:local-get-disk-usage": vi.fn().mockResolvedValue({total: 0, models: {}}),
    "ai:local-get-state": vi.fn().mockResolvedValue({status: "not_installed"}),
    "ai:on-local-state-changed": vi.fn(),
    "ai:on-local-download-progress": vi.fn(),
    "ai:on-local-catalog-changed": vi.fn(),
    "ai:local-refresh-catalog": vi.fn().mockResolvedValue("updated"),
  })
  setActivePinia(createPinia())
})
afterEach(() => vi.restoreAllMocks())

describe("localModel store — refreshCatalog", () => {
  it("invokes the IPC, reloads models on 'updated', and toggles the flag", async () => {
    const store = useLocalModelStore()
    const p = store.refreshCatalog()
    expect(store.isRefreshingCatalog).toBe(true)
    const result = await p
    expect(result).toBe("updated")
    expect(bridge["ai:local-refresh-catalog"]).toHaveBeenCalledOnce()
    expect(bridge["ai:local-list-models"]).toHaveBeenCalled()
    expect(store.isRefreshingCatalog).toBe(false)
  })

  it("does not reload models when result is 'unchanged'", async () => {
    bridge["ai:local-refresh-catalog"].mockResolvedValue("unchanged")
    const store = useLocalModelStore()
    bridge["ai:local-list-models"].mockClear()
    await store.refreshCatalog()
    expect(bridge["ai:local-list-models"]).not.toHaveBeenCalled()
  })

  it("subscribes to the catalog-changed event", () => {
    useLocalModelStore()
    expect(bridge["ai:on-local-catalog-changed"]).toHaveBeenCalled()
  })
})
