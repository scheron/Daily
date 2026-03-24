// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("@renderer/utils/ui/vue", () => ({
  toRawDeep: (v) => v,
}))

let bridge

describe("settingsStore", () => {
  beforeEach(() => {
    bridge = mockBridgeIPC()
    setActivePinia(createPinia())
  })

  async function getStore() {
    const {useSettingsStore} = await import("@renderer/stores/settings.store")
    const store = useSettingsStore()
    await vi.dynamicImportSettled()
    // wait for invoke(loadSettings)
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("loads settings via IPC on creation", async () => {
    const store = await getStore()

    expect(store.isSettingsLoaded).toBe(true)
    expect(store.settings).not.toBeNull()
    expect(store.settings.branch.activeId).toBe("main")
  })

  it("updateSettings merges and calls IPC save", async () => {
    const store = await getStore()

    await store.updateSettings({sync: {enabled: true}})

    expect(store.settings.sync.enabled).toBe(true)
    expect(bridge["settings:save"]).toHaveBeenCalledWith({sync: {enabled: true}})
  })

  it("updateSettings skips IPC when data is identical", async () => {
    const store = await getStore()

    await store.updateSettings({branch: {activeId: "main"}})

    expect(bridge["settings:save"]).not.toHaveBeenCalled()
  })

  it("revalidate reloads settings from IPC", async () => {
    const store = await getStore()

    bridge["settings:load"].mockResolvedValueOnce({
      ...store.settings,
      sync: {enabled: true},
    })

    await store.revalidate()

    expect(store.settings.sync.enabled).toBe(true)
  })
})
