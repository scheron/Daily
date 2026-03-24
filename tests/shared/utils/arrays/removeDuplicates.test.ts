// @ts-nocheck
import {describe, expect, it} from "vitest"

import {removeDuplicates} from "@shared/utils/arrays/removeDuplicates"

describe("removeDuplicates", () => {
  it("removes duplicate entries by key", () => {
    const items = [
      {id: "a", value: 1},
      {id: "b", value: 2},
      {id: "a", value: 3},
    ]
    const result = removeDuplicates(items, "id")
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toEqual(["a", "b"])
  })

  it("keeps first occurrence when duplicates exist", () => {
    const items = [
      {id: "x", value: "first"},
      {id: "x", value: "second"},
    ]
    const result = removeDuplicates(items, "id")
    expect(result[0].value).toBe("first")
  })

  it("returns same array when no duplicates", () => {
    const items = [
      {id: "1", value: "a"},
      {id: "2", value: "b"},
    ]
    const result = removeDuplicates(items, "id")
    expect(result).toHaveLength(2)
  })

  it("returns empty array for empty input", () => {
    expect(removeDuplicates([], "id")).toEqual([])
  })
})
