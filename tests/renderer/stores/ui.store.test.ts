// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("@renderer/utils/ui/vue", () => ({toRawDeep: (v) => v}))

describe("uiStore", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  async function getStore() {
    const {useUIStore} = await import("@renderer/stores/ui/ui.store")
    const store = useUIStore()
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("emptySectionsMode 'hide' disables auto-collapse (mutual exclusion)", async () => {
    const store = await getStore()

    store.emptySectionsMode = "collapse"
    expect(store.sectionsAutoCollapseEmpty).toBe(true)

    store.emptySectionsMode = "hide"
    expect(store.sectionsHideEmpty).toBe(true)
    expect(store.sectionsAutoCollapseEmpty).toBe(false)
  })

  it("emptySectionsMode 'collapse' disables hide (mutual exclusion)", async () => {
    const store = await getStore()

    store.emptySectionsMode = "hide"
    expect(store.sectionsHideEmpty).toBe(true)

    store.emptySectionsMode = "collapse"
    expect(store.sectionsAutoCollapseEmpty).toBe(true)
    expect(store.sectionsHideEmpty).toBe(false)
  })

  it("toggleLeftPanel flips and respects an explicit value", async () => {
    const store = await getStore()

    expect(store.leftPanelVisible).toBe(true)
    store.toggleLeftPanel()
    expect(store.leftPanelVisible).toBe(false)
    store.toggleLeftPanel(true)
    expect(store.leftPanelVisible).toBe(true)
  })
})
