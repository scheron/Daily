// @ts-nocheck
import {describe, expect, it} from "vitest"

import {WEB_LIMITS} from "@main/ai/web/constants"
import {computeWebReadBudget} from "@main/ai/web/utils/computeWebReadBudget"

describe("computeWebReadBudget", () => {
  it("falls back to the standard limits when context is unknown (remote)", () => {
    const b = computeWebReadBudget(null)
    expect(b.windowChars).toBe(WEB_LIMITS.maxTextChars)
    expect(b.maxServedChars).toBe(WEB_LIMITS.maxServedCharsPerPage)
  })

  it("scales the budget down for a small local context", () => {
    const b = computeWebReadBudget(4096)
    expect(b.maxServedChars).toBeLessThan(WEB_LIMITS.maxServedCharsPerPage)
    expect(b.windowChars).toBeLessThanOrEqual(b.maxServedChars)
  })

  it("gives a larger context a larger budget than a small one", () => {
    const small = computeWebReadBudget(4096)
    const big = computeWebReadBudget(131072)
    expect(big.maxServedChars).toBeGreaterThan(small.maxServedChars)
    expect(big.windowChars).toBeGreaterThan(small.windowChars)
  })

  it("clamps to sane minimums for a tiny context and never exceeds the served budget per window", () => {
    const b = computeWebReadBudget(256)
    expect(b.maxServedChars).toBeGreaterThanOrEqual(4000)
    expect(b.windowChars).toBeGreaterThanOrEqual(2000)
    expect(b.windowChars).toBeLessThanOrEqual(b.maxServedChars)
  })
})
