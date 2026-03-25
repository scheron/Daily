// @ts-nocheck
import {describe, expect, it} from "vitest"

import {isValidSnapshot} from "@main/utils/sync/snapshot/isValidSnapshot"

function validSnapshot() {
  return {
    version: 2,
    docs: {
      tasks: [],
      tags: [],
      branches: [],
      files: [],
      settings: null,
    },
    meta: {
      updatedAt: "2026-03-25T00:00:00.000Z",
      hash: "abc123",
    },
  }
}

describe("isValidSnapshot", () => {
  it("returns true for valid snapshot", () => {
    expect(isValidSnapshot(validSnapshot())).toBe(true)
  })

  it("returns false when version !== 2", () => {
    expect(isValidSnapshot({...validSnapshot(), version: 1})).toBe(false)
    expect(isValidSnapshot({...validSnapshot(), version: 3})).toBe(false)
  })

  it("returns false when docs missing", () => {
    const s = validSnapshot()
    delete s.docs
    expect(isValidSnapshot(s)).toBe(false)
  })

  it("returns false when meta missing", () => {
    const s = validSnapshot()
    delete s.meta
    expect(isValidSnapshot(s)).toBe(false)
  })

  it("returns false when meta.updatedAt missing", () => {
    const s = validSnapshot()
    delete s.meta.updatedAt
    expect(isValidSnapshot(s)).toBe(false)
  })

  it("returns false when meta.hash missing", () => {
    const s = validSnapshot()
    delete s.meta.hash
    expect(isValidSnapshot(s)).toBe(false)
  })

  it("returns false when docs.tasks is not array", () => {
    const s = validSnapshot()
    s.docs.tasks = "not-array"
    expect(isValidSnapshot(s)).toBe(false)
  })

  it("returns false for null/undefined/string input", () => {
    expect(isValidSnapshot(null)).toBe(false)
    expect(isValidSnapshot(undefined)).toBe(false)
    expect(isValidSnapshot("string")).toBe(false)
  })
})
