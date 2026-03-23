import {describe, expect, it} from "vitest"

import {deepClone} from "@shared/utils/common/deepClone"

describe("deepClone", () => {
  it("clones a plain object without shared references", () => {
    const original = {a: 1, b: {c: 2}}
    const cloned = deepClone(original)

    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned.b).not.toBe(original.b)
  })
})
