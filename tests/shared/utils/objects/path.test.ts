// @ts-nocheck
import {describe, expect, it} from "vitest"

import {getObjectValueFromPath, transformObjectFromPath} from "@shared/utils/objects/path"

describe("getObjectValueFromPath", () => {
  it("retrieves a deeply nested value using dot notation", () => {
    const obj = {a: {b: {c: 42}}}
    expect(getObjectValueFromPath(obj, "a.b.c")).toBe(42)
  })

  it("returns undefined for a path that does not exist", () => {
    const obj = {a: {b: 1}}
    expect(getObjectValueFromPath(obj, "a.b.c.d")).toBeUndefined()
  })

  it("supports a custom delimiter", () => {
    const obj = {a: {b: {c: "found"}}}
    expect(getObjectValueFromPath(obj, "a-b-c", "-")).toBe("found")
  })
})

describe("transformObjectFromPath", () => {
  it("builds a nested object from a dot-notation path and value", () => {
    expect(transformObjectFromPath("a.b", "value")).toEqual({a: {b: "value"}})
  })

  it("returns an empty object for an empty path", () => {
    expect(transformObjectFromPath("", "value")).toEqual({})
  })
})
