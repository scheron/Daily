// @ts-nocheck
import {describe, expect, it} from "vitest"

import {deepClone} from "@shared/utils/common/deepClone"

describe("deepClone", () => {
  it("returns primitives as-is", () => {
    expect(deepClone(42)).toBe(42)
    expect(deepClone("hello")).toBe("hello")
    expect(deepClone(null)).toBeNull()
    expect(deepClone(undefined)).toBeUndefined()
  })

  it("deeply clones nested objects without shared references", () => {
    const original = {a: {b: {c: 3}}}
    const cloned = deepClone(original)

    expect(cloned).toEqual(original)
    expect(cloned.a).not.toBe(original.a)
    expect(cloned.a.b).not.toBe(original.a.b)
  })

  it("clones arrays without shared references", () => {
    const original = [1, [2, 3], {a: 4}]
    const cloned = deepClone(original)

    expect(cloned).toEqual(original)
    expect(cloned[1]).not.toBe(original[1])
    expect(cloned[2]).not.toBe(original[2])
  })

  it("clones Date preserving time", () => {
    const date = new Date("2026-03-24T12:00:00Z")
    const cloned = deepClone(date)

    expect(cloned.getTime()).toBe(date.getTime())
    expect(cloned).not.toBe(date)
  })

  it("handles circular object references without infinite loop", () => {
    const obj: any = {a: 1}
    obj.self = obj

    const cloned = deepClone(obj)

    expect(cloned.a).toBe(1)
    expect(cloned.self).toBe(cloned)
    expect(cloned).not.toBe(obj)
  })

  it("returns class instances as-is", () => {
    class MyClass {
      value = 42
    }
    const instance = new MyClass()

    expect(deepClone(instance)).toBe(instance)
  })

  it("clones RegExp preserving source and flags", () => {
    const re = /hello/gi
    const cloned = deepClone(re)

    expect(cloned.source).toBe(re.source)
    expect(cloned.flags).toBe(re.flags)
    expect(cloned).not.toBe(re)
  })

  it("clones Map with all entries", () => {
    const map = new Map([
      ["key1", {a: 1}],
      ["key2", {b: 2}],
    ])
    const cloned = deepClone(map)

    expect(cloned).not.toBe(map)
    expect(cloned.size).toBe(2)
    expect(cloned.get("key1")).toEqual({a: 1})
    expect(cloned.get("key1")).not.toBe(map.get("key1"))
  })

  it("clones Set with all values", () => {
    const set = new Set([{x: 1}, {y: 2}])
    const cloned = deepClone(set)

    expect(cloned).not.toBe(set)
    expect(cloned.size).toBe(2)
  })

  it("clones ArrayBuffer as a copy", () => {
    const buffer = new ArrayBuffer(8)
    new Uint8Array(buffer)[0] = 42

    const cloned = deepClone(buffer)

    expect(cloned).not.toBe(buffer)
    expect(new Uint8Array(cloned)[0]).toBe(42)
  })

  it("clones TypedArray as a copy", () => {
    const typed = new Uint8Array([1, 2, 3])
    const cloned = deepClone(typed)

    expect(cloned).not.toBe(typed)
    expect(Array.from(cloned)).toEqual([1, 2, 3])
  })
})
