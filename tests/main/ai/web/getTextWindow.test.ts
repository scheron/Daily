// @ts-nocheck
import {describe, expect, it} from "vitest"

import {getTextWindow} from "@main/ai/web/utils/getTextWindow"

const text = "ABCDEFGHIJ".repeat(10) // 100 chars

describe("getTextWindow", () => {
  it("returns the first window and reports there is more", () => {
    const w = getTextWindow(text, {size: 30})
    expect(w.start).toBe(0)
    expect(w.end).toBe(30)
    expect(w.total).toBe(100)
    expect(w.hasMore).toBe(true)
    expect(w.window).toBe(text.slice(0, 30))
  })

  it("serves a later window from offset and detects the end", () => {
    const w = getTextWindow(text, {offset: 80, size: 30})
    expect(w.start).toBe(80)
    expect(w.end).toBe(100)
    expect(w.hasMore).toBe(false)
    expect(w.window).toBe(text.slice(80))
  })

  it("clamps an offset past the end", () => {
    const w = getTextWindow(text, {offset: 999, size: 30})
    expect(w.start).toBe(100)
    expect(w.end).toBe(100)
    expect(w.window).toBe("")
    expect(w.hasMore).toBe(false)
  })

  it("jumps to a case-insensitive find match", () => {
    const doc = `${"x".repeat(50)}/auth/register${"y".repeat(50)}`
    const w = getTextWindow(doc, {find: "REGISTER", size: 20})
    expect(w.found).toBe(true)
    expect(w.matchIndex).toBe(56) // 50 + "/auth/".length
    expect(w.start).toBe(56)
    expect(w.window.startsWith("register")).toBe(true)
  })

  it("finds the next match when given an offset past the first", () => {
    const doc = "needle____needle____"
    const w = getTextWindow(doc, {find: "needle", offset: 1, size: 6})
    expect(w.matchIndex).toBe(10)
    expect(w.window).toBe("needle")
  })

  it("reports not found without throwing", () => {
    const w = getTextWindow(text, {find: "zzz", size: 30})
    expect(w.found).toBe(false)
    expect(w.matchIndex).toBe(null)
    expect(w.window).toBe("")
  })
})
