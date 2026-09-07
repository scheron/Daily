// @ts-nocheck
import {describe, expect, it} from "vitest"

import {isValidSnapshot} from "@core/utils/sync/snapshot/isValidSnapshot"

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

  it("accepts version 2 and 3", () => {
    expect(isValidSnapshot({...validSnapshot(), version: 2})).toBe(true)
    expect(isValidSnapshot({...validSnapshot(), version: 3})).toBe(true)
  })

  it("returns false for unsupported versions", () => {
    expect(isValidSnapshot({...validSnapshot(), version: 1})).toBe(false)
    expect(isValidSnapshot({...validSnapshot(), version: 4})).toBe(true)
    expect(isValidSnapshot({...validSnapshot(), version: 5})).toBe(true)
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

  it("TC-7: accepts a version-5 snapshot carrying a task with no schedule, so it can land in the backlog instead of being rejected outright", () => {
    const backlogTask = {
      id: "t1",
      status: "active",
      content: "x",
      minimized: false,
      order_index: 0,
      scheduled_date: null,
      scheduled_time: null,
      scheduled_timezone: null,
      estimated_time: 0,
      spent_time: 0,
      branch_id: "main",
      tags: [],
      attachments: [],
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      deleted_at: null,
    }

    expect(isValidSnapshot({...validSnapshot(), version: 5, docs: {...validSnapshot().docs, tasks: [backlogTask]}})).toBe(true)
  })
})
