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
    const {useUIStore} = await import("@renderer/stores/ui.store")
    const store = useUIStore()
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("toggleTasksViewMode switches between list and columns", async () => {
    const store = await getStore()

    expect(store.tasksViewMode).toBe("list")

    store.toggleTasksViewMode()
    expect(store.tasksViewMode).toBe("columns")

    store.toggleTasksViewMode()
    expect(store.tasksViewMode).toBe("list")
  })

  it("toggleColumnsHideEmpty disables autoCollapseEmpty (mutual exclusion)", async () => {
    const store = await getStore()

    store.toggleColumnsAutoCollapseEmpty(true)
    expect(store.columnsAutoCollapseEmpty).toBe(true)

    store.toggleColumnsHideEmpty(true)
    expect(store.columnsHideEmpty).toBe(true)
    expect(store.columnsAutoCollapseEmpty).toBe(false)
  })

  it("toggleColumnsAutoCollapseEmpty disables hideEmpty (mutual exclusion)", async () => {
    const store = await getStore()

    store.toggleColumnsHideEmpty(true)
    expect(store.columnsHideEmpty).toBe(true)

    store.toggleColumnsAutoCollapseEmpty(true)
    expect(store.columnsAutoCollapseEmpty).toBe(true)
    expect(store.columnsHideEmpty).toBe(false)
  })
})
