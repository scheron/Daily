// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mergeCollections} from "@main/utils/sync/merge/mergeCollections"

const now = new Date().toISOString()
const old = new Date(Date.now() - 10_000).toISOString()
const veryOld = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

function makeDoc(id, updatedAt = now, deletedAt = null) {
  return {id, updated_at: updatedAt, deleted_at: deletedAt}
}

const GC_INTERVAL = 7 * 24 * 60 * 60 * 1000 // 7 days

describe("mergeCollections", () => {
  describe("basic merge", () => {
    it("returns local-only docs unchanged", () => {
      const local = [makeDoc("a")]
      const {result} = mergeCollections(local, [], "pull", GC_INTERVAL)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("a")
    })

    it("returns remote-only docs", () => {
      const remote = [makeDoc("b")]
      const {result} = mergeCollections([], remote, "pull", GC_INTERVAL)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("b")
    })

    it("merges both into union", () => {
      const local = [makeDoc("a")]
      const remote = [makeDoc("b")]
      const {result} = mergeCollections(local, remote, "pull", GC_INTERVAL)
      expect(result).toHaveLength(2)
      const ids = result.map((d) => d.id)
      expect(ids).toContain("a")
      expect(ids).toContain("b")
    })
  })

  describe("LWW conflict resolution", () => {
    it("remote wins when remote.updated_at is newer", () => {
      const local = [makeDoc("a", old)]
      const remote = [makeDoc("a", now)]
      const {result} = mergeCollections(local, remote, "pull", GC_INTERVAL)
      expect(result[0].updated_at).toBe(now)
    })

    it("local wins when local.updated_at is newer", () => {
      const local = [makeDoc("a", now)]
      const remote = [makeDoc("a", old)]
      const {result} = mergeCollections(local, remote, "pull", GC_INTERVAL)
      expect(result[0].updated_at).toBe(now)
    })

    it("pull strategy: remote wins on tie", () => {
      const ts = now
      const local = [{...makeDoc("a", ts), source: "local"}]
      const remote = [{...makeDoc("a", ts), source: "remote"}]
      const {result} = mergeCollections(local, remote, "pull", GC_INTERVAL)
      expect(result[0].source).toBe("remote")
    })

    it("push strategy: local wins on tie", () => {
      const ts = now
      const local = [{...makeDoc("a", ts), source: "local"}]
      const remote = [{...makeDoc("a", ts), source: "remote"}]
      const {result} = mergeCollections(local, remote, "push", GC_INTERVAL)
      expect(result[0].source).toBe("local")
    })
  })

  describe("soft-delete propagation", () => {
    it("remote soft-delete overwrites local active (remote newer)", () => {
      const local = [makeDoc("a", old, null)]
      const remote = [makeDoc("a", now, now)]
      const {result} = mergeCollections(local, remote, "pull", GC_INTERVAL)
      expect(result[0].deleted_at).toBe(now)
    })

    it("local soft-delete preserved when local is newer", () => {
      const local = [makeDoc("a", now, now)]
      const remote = [makeDoc("a", old, null)]
      const {result} = mergeCollections(local, remote, "pull", GC_INTERVAL)
      expect(result[0].deleted_at).toBe(now)
    })
  })

  describe("garbage collection", () => {
    it("removes docs where deleted_at is older than gcIntervalMs", () => {
      const local = [makeDoc("a", veryOld, veryOld)]
      const {result, toGc} = mergeCollections(local, [], "pull", GC_INTERVAL)
      expect(result).toHaveLength(0)
      expect(toGc).toContain("a")
    })

    it("keeps docs where deleted_at is within gcIntervalMs", () => {
      const recentDelete = new Date(Date.now() - 1000).toISOString()
      const local = [makeDoc("a", recentDelete, recentDelete)]
      const {result, toGc} = mergeCollections(local, [], "pull", GC_INTERVAL)
      expect(result).toHaveLength(1)
      expect(toGc).toHaveLength(0)
    })

    it("GC applies to both local-only and merged docs", () => {
      const local = [makeDoc("a", veryOld, veryOld)]
      const remote = [makeDoc("a", veryOld, veryOld)]
      const {result, toGc} = mergeCollections(local, remote, "pull", GC_INTERVAL)
      expect(result).toHaveLength(0)
      expect(toGc).toContain("a")
    })

    it("remote-only expired docs are silently dropped", () => {
      const remote = [makeDoc("a", veryOld, veryOld)]
      const {result, toGc} = mergeCollections([], remote, "pull", GC_INTERVAL)
      expect(result).toHaveLength(0)
      expect(toGc).toHaveLength(0) // no local record to GC
    })
  })
})
