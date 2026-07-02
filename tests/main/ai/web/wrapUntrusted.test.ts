// @ts-nocheck
import {describe, expect, it} from "vitest"

import {wrapUntrusted} from "@main/ai/web/utils/wrapUntrusted"

describe("wrapUntrusted", () => {
  it("wraps content with untrusted delimiters and the source url", () => {
    const out = wrapUntrusted("hello world", "https://example.com/p")
    expect(out).toContain("UNTRUSTED WEB CONTENT")
    expect(out).toContain("https://example.com/p")
    expect(out).toContain("hello world")
    expect(out).toContain("END UNTRUSTED WEB CONTENT")
  })

  it("truncates content beyond maxTextChars and marks it", () => {
    const out = wrapUntrusted("a".repeat(50_000), "https://example.com/p")
    expect(out.length).toBeLessThan(50_000)
    expect(out).toContain("truncated")
  })
})
