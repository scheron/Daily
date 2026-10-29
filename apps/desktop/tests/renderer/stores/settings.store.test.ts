// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {deepMerge} from "@daily/std"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

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

  it("keeps successive save batches independent across revalidation and external settings changes", async () => {
    const store = await getStore()
    let persisted = JSON.parse(JSON.stringify(store.settings))
    const batches = []
    bridge["settings:load"].mockImplementation(async () => JSON.parse(JSON.stringify(persisted)))
    bridge["settings:save"].mockImplementation(async (updates) => {
      const batch = JSON.parse(JSON.stringify(updates))
      batches.push(batch)
      persisted = deepMerge(persisted, JSON.parse(JSON.stringify(batch)))
    })
    vi.useFakeTimers()
    try {
      store.updateSettings({branch: {activeId: "gate", isAllProjects: false}})
      store.updateSettings({themes: {current: "github-dark"}})
      await vi.advanceTimersByTimeAsync(300)
      store.updateSettings({branch: {isAllProjects: true}})
      await vi.advanceTimersByTimeAsync(300)
      persisted.branch = {activeId: "main", isAllProjects: false}
      await store.revalidate()
      store.updateSettings({appearance: {boardMode: "agents"}})
      await vi.advanceTimersByTimeAsync(300)
      await store.revalidate()
      expect(store.settings.branch).toEqual({activeId: "main", isAllProjects: false})
      store.updateSettings({layout: {sectionsCollapsed: {done: true}}})
      store.updateSettings({layout: {sectionsCollapsed: {cancelled: true}}})
      store.updateSettings({appearance: {taskView: "compact"}})
      await store.flush()
      const order = ["done", "backlog", "ready_for_agent", "in_progress", "ready_to_merge", "cancelled"]
      store.updateSettings({layout: {columnOrder: order}})
      await vi.advanceTimersByTimeAsync(300)
      persisted.branch = {activeId: "external", isAllProjects: false}
      persisted.themes.current = "github-light"
      persisted.appearance = {boardMode: "normal", taskView: "regular"}
      persisted.layout = {sectionsCollapsed: {done: false}, columnOrder: [...order].reverse()}
      const external = JSON.parse(JSON.stringify(persisted))
      await store.revalidate()
      store.updateSettings({typography: {fontSize: "large"}})
      await store.flush()
      await store.revalidate()
      expect(store.settings).toEqual({...external, typography: {fontSize: "large"}})
      expect(batches).toEqual([
        {branch: {activeId: "gate", isAllProjects: false}, themes: {current: "github-dark"}},
        {branch: {isAllProjects: true}},
        {appearance: {boardMode: "agents"}},
        {layout: {sectionsCollapsed: {done: true, cancelled: true}}, appearance: {taskView: "compact"}},
        {layout: {columnOrder: ["done", "backlog", "ready_for_agent", "in_progress", "ready_to_merge", "cancelled"]}},
        {typography: {fontSize: "large"}},
      ])
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
