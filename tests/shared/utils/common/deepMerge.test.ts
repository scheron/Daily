// @ts-nocheck
import {describe, expect, it} from "vitest"

import {deepMerge} from "@shared/utils/common/deepMerge"

describe("deepMerge", () => {
  it("copies source properties into target in-place", () => {
    const target = {a: 1, b: 2}
    const result = deepMerge(target, {b: 3, c: 4})

    expect(result).toBe(target)
    expect(result).toEqual({a: 1, b: 3, c: 4})
  })

  it("recursively merges nested objects preserving target reference", () => {
    const nested = {x: 1, y: 2}
    const target = {a: nested, b: 3}

    deepMerge(target, {a: {y: 99, z: 100}})

    expect(target.a).toBe(nested)
    expect(target.a).toEqual({x: 1, y: 99, z: 100})
  })

  it("updates existing array items by ID and appends new ones", () => {
    const target = [
      {id: "1", name: "Alice"},
      {id: "2", name: "Bob"},
    ]

    deepMerge(target, [
      {id: "2", name: "Bobby"},
      {id: "3", name: "Charlie"},
    ])

    expect(target).toEqual([
      {id: "1", name: "Alice"},
      {id: "2", name: "Bobby"},
      {id: "3", name: "Charlie"},
    ])
  })

  it("replaces array entirely when source items have no IDs", () => {
    const target = [1, 2, 3]
    const result = deepMerge(target, [4, 5])

    expect(result).toEqual([4, 5])
  })

  it("returns target when source is nullish", () => {
    const target = {a: 1}

    expect(deepMerge(target, null)).toEqual({a: 1})
    expect(deepMerge(target, undefined)).toEqual({a: 1})
  })

  it("returns source when target is nullish", () => {
    expect(deepMerge(null, {a: 1})).toEqual({a: 1})
    expect(deepMerge(undefined, {a: 1})).toEqual({a: 1})
  })

  it("replaces primitive with object in source", () => {
    const target = {a: 42}
    deepMerge(target, {a: {nested: true}})

    expect(target.a).toEqual({nested: true})
  })

  it("sets null from source into target", () => {
    const target = {a: {nested: true}}
    deepMerge(target, {a: null})

    expect(target.a).toBeNull()
  })

  it("empty object source preserves target", () => {
    const target = {a: 1, b: {c: 2}}
    deepMerge(target, {})

    expect(target).toEqual({a: 1, b: {c: 2}})
  })

  it("uses custom getId for array item matching", () => {
    const target = [{key: "a", val: 1}]

    deepMerge(target, [{key: "a", val: 99}], (item) => item.key)

    expect(target[0].val).toBe(99)
  })
})
