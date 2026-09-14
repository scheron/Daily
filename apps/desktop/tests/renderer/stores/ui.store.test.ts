// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("../../../src/renderer/src/utils/ui/vue", () => ({toRawDeep: (v) => v}))

describe("uiStore", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  async function getStore() {
    const {useUIStore} = await import("../../../src/renderer/src/stores/ui/ui.store")
    const store = useUIStore()
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("emptySectionsMode 'hide' disables auto-collapse (mutual exclusion)", async () => {
    const store = await getStore()

    store.emptySectionsMode = "collapse"
    expect(store.shouldCollapseEmptySections).toBe(true)

    store.emptySectionsMode = "hide"
    expect(store.shouldHideEmptySections).toBe(true)
    expect(store.shouldCollapseEmptySections).toBe(false)
  })

  it("emptySectionsMode 'collapse' disables hide (mutual exclusion)", async () => {
    const store = await getStore()

    store.emptySectionsMode = "hide"
    expect(store.shouldHideEmptySections).toBe(true)

    store.emptySectionsMode = "collapse"
    expect(store.shouldCollapseEmptySections).toBe(true)
    expect(store.shouldHideEmptySections).toBe(false)
  })

  it("toggleCalendarDock_TC-10_flips_with_no_argument_and_sets_with_one", async () => {
    const store = await getStore()

    expect(store.isCalendarDockExpanded).toBe(false)
    store.toggleCalendarDock()
    expect(store.isCalendarDockExpanded).toBe(true)
    store.toggleCalendarDock()
    expect(store.isCalendarDockExpanded).toBe(false)
    store.toggleCalendarDock(true)
    expect(store.isCalendarDockExpanded).toBe(true)
    store.toggleCalendarDock(false)
    expect(store.isCalendarDockExpanded).toBe(false)
  })
})
