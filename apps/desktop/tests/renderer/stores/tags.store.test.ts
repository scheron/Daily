// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useTagsStore} from "../../../src/renderer/src/stores/tags.store"
import {API} from "../../../src/renderer/src/api"
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
  return {id: "tag-1", name: "Work", color: "#000", createdAt: "", updatedAt: "", deletedAt: null, ...overrides}
}

describe("tagsStore", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it("createTag pushes to local array", async () => {
    const tag = makeTag()
    API.createTag.mockResolvedValueOnce(tag)

    const store = useTagsStore()
    await store.createTag("Work", "#000")

    expect(store.tags).toHaveLength(1)
    expect(store.tagsMap.get("tag-1")).toBeTruthy()
  })

  it("deleteTag removes from local array", async () => {
    API.createTag.mockResolvedValueOnce(makeTag())

    const store = useTagsStore()
    await store.createTag("Work", "#000")
    await store.deleteTag("tag-1")

    expect(store.tags).toHaveLength(0)
  })
})
