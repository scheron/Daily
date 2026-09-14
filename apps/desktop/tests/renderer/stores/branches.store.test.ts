// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("../../../src/renderer/src/utils/ui/vue", () => ({toRawDeep: (v) => v}))

vi.mock("../../../src/renderer/src/api", () => ({
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
    const {useBranchesStore} = await import("../../../src/renderer/src/stores/branches.store")
    const store = useBranchesStore()
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("createBranch rejects empty name", async () => {
    const store = await getStore()
    const result = await store.createBranch("   ")

    expect(result).toBeNull()
  })

  it("createBranch trims name, makes one call and reads no list", async () => {
    const {API} = await import("../../../src/renderer/src/api")
    const branch = makeBranch({name: "Feature"})
    API.createBranch.mockResolvedValueOnce(branch)

    const store = await getStore()
    const result = await store.createBranch("  Feature  ")

    expect(result.name).toBe("Feature")
    expect(API.createBranch).toHaveBeenCalledWith({name: "Feature", description: ""})
    expect(API.createBranch).toHaveBeenCalledTimes(1)
    expect(API.getBranchList).not.toHaveBeenCalled()
  })

  it("updateBranchName makes one call and reads no list", async () => {
    const {API} = await import("../../../src/renderer/src/api")
    const branch = makeBranch({name: "Renamed"})
    API.updateBranch.mockResolvedValueOnce(branch)

    const store = await getStore()
    const result = await store.updateBranchName("branch-1", "Renamed")

    expect(result.name).toBe("Renamed")
    expect(API.updateBranch).toHaveBeenCalledWith("branch-1", {name: "Renamed"})
    expect(API.updateBranch).toHaveBeenCalledTimes(1)
    expect(API.getBranchList).not.toHaveBeenCalled()
  })

  it("updateBranchDescription makes one call and reads no list", async () => {
    const {API} = await import("../../../src/renderer/src/api")
    const branch = makeBranch({description: "New description"})
    API.updateBranch.mockResolvedValueOnce(branch)

    const store = await getStore()
    const result = await store.updateBranchDescription("branch-1", "New description")

    expect(result.description).toBe("New description")
    expect(API.updateBranch).toHaveBeenCalledWith("branch-1", {description: "New description"})
    expect(API.updateBranch).toHaveBeenCalledTimes(1)
    expect(API.getBranchList).not.toHaveBeenCalled()
  })

  it("deleteBranch makes one call and reads no list", async () => {
    const {API} = await import("../../../src/renderer/src/api")

    const store = await getStore()
    const result = await store.deleteBranch("branch-1")

    expect(result).toBe(true)
    expect(API.deleteBranch).toHaveBeenCalledTimes(1)
    expect(API.getBranchList).not.toHaveBeenCalled()
  })

  it("orderedBranches puts main first and sorts the rest by name case-insensitive", async () => {
    const {API} = await import("../../../src/renderer/src/api")
    API.getBranchList.mockResolvedValueOnce([
      makeBranch({id: "b", name: "Zebra"}),
      makeBranch({id: "main", name: "Main"}),
      makeBranch({id: "a", name: "alpha"}),
    ])

    const store = await getStore()
    await store.getBranchList()

    expect(store.orderedBranches.map((b) => b.name)).toEqual(["Main", "alpha", "Zebra"])
  })

  it("deleteBranch revalidates settings", async () => {
    const {API} = await import("../../../src/renderer/src/api")
    API.getBranchList.mockResolvedValue([])

    const store = await getStore()
    await store.deleteBranch("branch-1")

    // settings:load should be called again (revalidate)
    const bridge = window.BridgeIPC
    expect(bridge["settings:load"]).toHaveBeenCalled()
  })
})
