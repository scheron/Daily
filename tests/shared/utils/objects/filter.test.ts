// @ts-nocheck
import {describe, expect, it} from "vitest"

import {objectFilter} from "@shared/utils/objects/filter"

describe("objectFilter", () => {
  it("keeps only entries where callback returns true", () => {
    const obj = {a: 1, b: 2, c: 3}
    const result = objectFilter(obj, (v) => v > 1)
    expect(result).toEqual({b: 2, c: 3})
  })

  it("returns empty object when nothing passes filter", () => {
    const obj = {a: 1, b: 2}
    const result = objectFilter(obj, () => false)
    expect(result).toEqual({})
  })

  it("returns all entries when everything passes", () => {
    const obj = {x: "foo", y: "bar"}
    const result = objectFilter(obj, () => true)
    expect(result).toEqual({x: "foo", y: "bar"})
  })

  it("passes key as second argument to callback", () => {
    const obj = {keep: 1, drop: 2}
    const result = objectFilter(obj, (_, key) => key === "keep")
    expect(result).toEqual({keep: 1})
  })

  it("works with boolean values and falsy filtering", () => {
    const obj = {a: null, b: 0, c: "", d: "value", e: 42}
    const result = objectFilter(obj, (v) => Boolean(v))
    expect(result).toEqual({d: "value", e: 42})
  })

  it("does not include prototype properties", () => {
    const base = {inherited: true}
    const obj = Object.create(base)
    obj.own = "yes"
    const result = objectFilter(obj, () => true)
    expect(result).toEqual({own: "yes"})
    expect(result).not.toHaveProperty("inherited")
  })
})
