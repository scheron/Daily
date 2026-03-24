// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@renderer/api"
import {useTagsStore} from "@renderer/stores/tags.store"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("@renderer/utils/ui/vue", () => ({toRawDeep: (v) => v}))

vi.mock("@renderer/api", () => ({
  API: {
    getTagList: vi.fn().mockResolvedValue([]),
    createTag: vi.fn(),
    updateTag: vi.fn(),
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

  it("updateTag replaces item in-place", async () => {
    API.createTag.mockResolvedValueOnce(makeTag())
    API.updateTag.mockResolvedValueOnce(makeTag({name: "Personal"}))

    const store = useTagsStore()
    await store.createTag("Work", "#000")
    await store.updateTag("tag-1", {name: "Personal"})

    expect(store.tags[0].name).toBe("Personal")
  })
})
