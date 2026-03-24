// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mergeCollections} from "@main/utils/sync/merge/mergeCollections"

const ONE_DAY = 86_400_000
const GC_INTERVAL = 7 * ONE_DAY

function makeDoc(overrides = {}) {
  return {
    id: "doc-1",
    updated_at: "2026-03-20T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  }
}

describe("mergeCollections", () => {
  it("keeps remote-only documents", () => {
    const {result} = mergeCollections([], [makeDoc({id: "r1"})], "pull", GC_INTERVAL)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("r1")
  })

  it("keeps local-only documents", () => {
    const {result} = mergeCollections([makeDoc({id: "l1"})], [], "pull", GC_INTERVAL)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("l1")
  })

  it("LWW: newer document wins regardless of strategy", () => {
    const local = [makeDoc({id: "1", updated_at: "2026-03-22T00:00:00.000Z", content: "local"})]
    const remote = [makeDoc({id: "1", updated_at: "2026-03-20T00:00:00.000Z", content: "remote"})]

    const {result} = mergeCollections(local, remote, "pull", GC_INTERVAL)

    expect(result[0].content).toBe("local")
  })

  it("pull strategy: remote wins on equal timestamps", () => {
    const ts = "2026-03-20T00:00:00.000Z"
    const local = [makeDoc({id: "1", updated_at: ts, content: "local"})]
    const remote = [makeDoc({id: "1", updated_at: ts, content: "remote"})]

    const {result} = mergeCollections(local, remote, "pull", GC_INTERVAL)

    expect(result[0].content).toBe("remote")
  })

  it("push strategy: local wins on equal timestamps", () => {
    const ts = "2026-03-20T00:00:00.000Z"
    const local = [makeDoc({id: "1", updated_at: ts, content: "local"})]
    const remote = [makeDoc({id: "1", updated_at: ts, content: "remote"})]

    const {result} = mergeCollections(local, remote, "push", GC_INTERVAL)

    expect(result[0].content).toBe("local")
  })

  it("garbage collects expired soft-deleted documents", () => {
    const oldDeletedAt = new Date(Date.now() - GC_INTERVAL - ONE_DAY).toISOString()
    const local = [makeDoc({id: "1", deleted_at: oldDeletedAt, updated_at: oldDeletedAt})]

    const {result, toGc} = mergeCollections(local, [], "pull", GC_INTERVAL)

    expect(result).toHaveLength(0)
    expect(toGc).toContain("1")
  })

  it("does not garbage collect recently deleted documents", () => {
    const recentDeletedAt = new Date(Date.now() - ONE_DAY).toISOString()
    const local = [makeDoc({id: "1", deleted_at: recentDeletedAt, updated_at: recentDeletedAt})]

    const {result, toGc} = mergeCollections(local, [], "pull", GC_INTERVAL)

    expect(result).toHaveLength(1)
    expect(toGc).toHaveLength(0)
  })
})
