// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it} from "vitest"

import {useFilterStore} from "@renderer/stores/filter.store"

describe("filterStore", () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useFilterStore()
  })

  it("setActiveTags toggles tag in set", () => {
    store.setActiveTags("tag-1")
    expect(store.activeTagIds.has("tag-1")).toBe(true)

    store.setActiveTags("tag-1")
    expect(store.activeTagIds.has("tag-1")).toBe(false)
  })

  it("clearActiveTags empties the set", () => {
    store.setActiveTags("tag-1")
    store.setActiveTags("tag-2")

    store.clearActiveTags()

    expect(store.activeTagIds.size).toBe(0)
  })

  it("setActiveFilter changes the filter", () => {
    store.setActiveFilter("done")
    expect(store.activeFilter).toBe("done")
  })
})
