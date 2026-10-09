// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("../../../src/renderer/src/utils/ui/toRawDeep", () => ({
  toRawDeep: (v) => v,
}))

let bridge

describe("settingsStore", () => {
  beforeEach(() => {
    bridge = mockBridgeIPC()
    setActivePinia(createPinia())
  })

  async function getStore() {
    const {useSettingsStore} = await import("../../../src/renderer/src/stores/settings.store")
    const store = useSettingsStore()
    await vi.dynamicImportSettled()
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("loads settings via IPC on creation", async () => {
    const store = await getStore()

    expect(store.isSettingsLoaded).toBe(true)
    expect(store.settings).not.toBeNull()
    expect(store.settings.branch.activeId).toBe("main")
  })

  it("updateSettings merges immediately and calls IPC save after debounce", async () => {
    const store = await getStore()
    vi.useFakeTimers()
    try {
      store.updateSettings({sync: {enabled: true}})

      expect(store.settings.sync.enabled).toBe(true)
      expect(bridge["settings:save"]).not.toHaveBeenCalled()

      await vi.runAllTimersAsync()

      expect(bridge["settings:save"]).toHaveBeenCalledWith({sync: {enabled: true}})
    } finally {
      vi.useRealTimers()
    }
  })

  it("rapid updateSettings calls coalesce into a single IPC save", async () => {
    const store = await getStore()
    vi.useFakeTimers()
    try {
      store.updateSettings({sync: {enabled: true}})
      store.updateSettings({branch: {activeId: "other"}})
      store.updateSettings({themes: {current: "github-dark"}})

      expect(bridge["settings:save"]).not.toHaveBeenCalled()

      await vi.runAllTimersAsync()

      expect(bridge["settings:save"]).toHaveBeenCalledTimes(1)
      expect(bridge["settings:save"]).toHaveBeenCalledWith({
        sync: {enabled: true},
        branch: {activeId: "other"},
        themes: {current: "github-dark"},
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("updateSettings skips IPC when data is identical", async () => {
    const store = await getStore()
    vi.useFakeTimers()
    try {
      store.updateSettings({branch: {activeId: "main"}})
      await vi.runAllTimersAsync()

      expect(bridge["settings:save"]).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("updates validated card geometry immediately and on settings reload without rewriting other appearance values", async () => {
    const store = await getStore()
    const {useBoardCardGeometry} = await import("../../../src/renderer/src/composables/useBoardCardGeometry")
    const geometry = useBoardCardGeometry()
    expect(geometry.taskView.value).toBe("regular")
    expect(geometry.cardHeight.value).toBe(200)
    expect(geometry.cardStep.value).toBe(206)
    store.settings.appearance = {mode: "dark", accent: "rose", taskView: "invalid"}
    expect(geometry.taskView.value).toBe("regular")
    expect(store.settings.appearance.mode).toBe("dark")
    bridge["settings:load"].mockResolvedValueOnce({
      ...store.settings,
      appearance: {...store.settings.appearance, taskView: "compact"},
      typography: {fontSize: "large"},
    })
    await store.revalidate()
    expect(geometry.taskView.value).toBe("compact")
    expect(geometry.cardHeight.value).toBeCloseTo(122.4)
    expect(geometry.cardStep.value).toBeCloseTo(128.4)
    vi.useFakeTimers()
    try {
      geometry.taskView.value = "regular"
      expect(geometry.cardHeight.value).toBe(200)
      expect(geometry.cardStep.value).toBe(206)
      expect(store.settings.appearance.accent).toBe("rose")
      await vi.runAllTimersAsync()
      expect(bridge["settings:save"]).toHaveBeenCalledWith({appearance: {taskView: "regular"}})
    } finally {
      vi.useRealTimers()
    }
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
