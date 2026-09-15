// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useStorageChangesStore} from "../../../src/renderer/src/stores/storageChanges.store"
import {useTagsStore} from "../../../src/renderer/src/stores/tags.store"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("../../../src/renderer/src/utils/ui/toRawDeep", () => ({toRawDeep: (v) => v}))

vi.mock("../../../src/renderer/src/api", () => ({
  API: {
    getTagList: vi.fn().mockResolvedValue([]),
    createTag: vi.fn(),
    deleteTag: vi.fn().mockResolvedValue(true),
  },
}))

function makeTag(overrides = {}) {
  return {id: "tag-1", branchId: "main", name: "Work", color: "#000", createdAt: "", updatedAt: "", deletedAt: null, ...overrides}
}

describe("storageChangesStore", () => {
  let onStorageChanged

  beforeEach(() => {
    onStorageChanged = null
    mockBridgeIPC({
      "storage:on-changed": vi.fn((callback) => {
        onStorageChanged = callback
      }),
    })
    setActivePinia(createPinia())
  })

  it("replaces a renamed tag in place and keeps the collection sorted by name", async () => {
    const tagsStore = useTagsStore()
    tagsStore.tags = [makeTag({id: "tag-a", name: "Alpha"}), makeTag({id: "tag-b", name: "Beta"})]

    useStorageChangesStore()

    await onStorageChanged({tags: {upserted: [makeTag({id: "tag-b", name: "Aaron"})]}})

    expect(tagsStore.tags).toHaveLength(2)
    expect(tagsStore.tags.map((tag) => tag.id)).toEqual(["tag-b", "tag-a"])
    expect(tagsStore.tags.find((tag) => tag.id === "tag-b")?.name).toBe("Aaron")
  })
})
