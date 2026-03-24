// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("@renderer/utils/ui/vue", () => ({toRawDeep: (v) => v}))

vi.mock("@renderer/api", () => ({
  API: {
    getBranchList: vi.fn().mockResolvedValue([]),
    createBranch: vi.fn(),
    updateBranch: vi.fn(),
    deleteBranch: vi.fn().mockResolvedValue(true),
    setActiveBranch: vi.fn().mockResolvedValue(undefined),
  },
}))

function makeBranch(overrides = {}) {
  return {id: "branch-1", name: "Feature", createdAt: "", updatedAt: "", deletedAt: null, ...overrides}
}

describe("branchesStore", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function getStore() {
    const {useBranchesStore} = await import("@renderer/stores/branches.store")
    const store = useBranchesStore()
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("createBranch rejects empty name", async () => {
    const store = await getStore()
    const result = await store.createBranch("   ")

    expect(result).toBeNull()
  })

  it("createBranch trims name and reloads list", async () => {
    const {API} = await import("@renderer/api")
    const branch = makeBranch({name: "Feature"})
    API.createBranch.mockResolvedValueOnce(branch)
    API.getBranchList.mockResolvedValueOnce([branch])

    const store = await getStore()
    const result = await store.createBranch("  Feature  ")

    expect(result.name).toBe("Feature")
    expect(API.createBranch).toHaveBeenCalledWith({name: "Feature"})
  })

  it("orderedBranches sorts by name case-insensitive", async () => {
    const {API} = await import("@renderer/api")
    API.getBranchList.mockResolvedValueOnce([
      makeBranch({id: "b", name: "Zebra"}),
      makeBranch({id: "a", name: "alpha"}),
      makeBranch({id: "c", name: "Main"}),
    ])

    const store = await getStore()
    await store.getBranchList()

    expect(store.orderedBranches.map((b) => b.name)).toEqual(["alpha", "Main", "Zebra"])
  })

  it("deleteBranch revalidates settings", async () => {
    const {API} = await import("@renderer/api")
    API.getBranchList.mockResolvedValue([])

    const store = await getStore()
    await store.deleteBranch("branch-1")

    // settings:load should be called again (revalidate)
    const bridge = window.BridgeIPC
    expect(bridge["settings:load"]).toHaveBeenCalled()
  })
})
