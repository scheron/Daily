// @ts-nocheck
import {describe, expect, it} from "vitest"

import {clamp} from "@shared/utils/numbers/clamp"

describe("clamp", () => {
  it("returns the value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it("clamps to the lower and upper bounds", () => {
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(42, 0, 10)).toBe(10)
  })

  it("returns the bounds themselves at the edges", () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})
