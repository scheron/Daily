// @ts-nocheck
import {describe, expect, it} from "vitest"

import {findTagByName, isValidTagName, normalizeTagName} from "@shared/utils/tags/tagName"

function makeTag(name: string) {
  return {id: name, name, color: "#000000", createdAt: "", updatedAt: "", deletedAt: null}
}

describe("normalizeTagName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTagName("  hello  ")).toBe("hello")
  })

  it("collapses internal whitespace runs to a single space, keeping spaces", () => {
    expect(normalizeTagName("in   progress")).toBe("in progress")
  })

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeTagName("   ")).toBe("")
  })
})

describe("isValidTagName", () => {
  it("accepts multi-word names with spaces", () => {
    expect(isValidTagName("in progress")).toBe(true)
  })

  it("rejects empty and whitespace-only names", () => {
    expect(isValidTagName("")).toBe(false)
    expect(isValidTagName("   ")).toBe(false)
  })
})

describe("findTagByName", () => {
  const tags = [makeTag("Design"), makeTag("in progress")]

  it("matches case-insensitively after normalization", () => {
    expect(findTagByName(tags, "  design ")?.name).toBe("Design")
    expect(findTagByName(tags, "IN   PROGRESS")?.name).toBe("in progress")
  })

  it("returns null when no tag matches", () => {
    expect(findTagByName(tags, "missing")).toBeNull()
  })
})
