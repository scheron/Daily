// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useStorageChangesStore} from "../../../src/renderer/src/stores/storageChanges.store"
import {useTagsStore} from "../../../src/renderer/src/stores/tags.store"
import {useTaskRelationsStore} from "../../../src/renderer/src/stores/taskRelations.store"
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

function makeRelation(overrides = {}) {
  return {
    id: "r1",
    blockerId: "a",
    blockedId: "b",
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
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

  it("keeps_TC-12_only_the_still-live_relation_when_a_storage-on-changed_broadcast_carries_the_same_changeset_twice", async () => {
    const relationsStore = useTaskRelationsStore()
    relationsStore.relations = [makeRelation({id: "r1"}), makeRelation({id: "r2"})]

    useStorageChangesStore()

    const changeset = {
      relations: {
        upserted: [makeRelation({id: "r3"}), {...makeRelation({id: "r1"}), deletedAt: "2026-09-14T10:00:00.000Z"}],
        removed: ["r2"],
      },
    }

    await onStorageChanged(changeset)
    expect(relationsStore.relations.map((r) => r.id)).toEqual(["r3"])

    await onStorageChanged(structuredClone(changeset))
    expect(relationsStore.relations.map((r) => r.id)).toEqual(["r3"])
  })
})
