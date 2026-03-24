// @ts-nocheck
import {describe, expect, it} from "vitest"

import {calcLevenshteinDistance} from "@shared/utils/strings/calcLevenshteinDistance"

describe("calcLevenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(calcLevenshteinDistance("hello", "hello")).toBe(0)
  })

  it("returns the length of the other string when one string is empty", () => {
    expect(calcLevenshteinDistance("", "hello")).toBe(5)
    expect(calcLevenshteinDistance("hello", "")).toBe(5)
  })

  it("returns 1 for a single substitution", () => {
    expect(calcLevenshteinDistance("cat", "bat")).toBe(1)
  })

  it("returns 1 for a single insertion", () => {
    expect(calcLevenshteinDistance("car", "card")).toBe(1)
  })
})
