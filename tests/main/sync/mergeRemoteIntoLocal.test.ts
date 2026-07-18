// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mergeRemoteIntoLocal} from "@main/utils/sync/merge/mergeRemoteIntoLocal"

const GC = 7 * 24 * 60 * 60 * 1000
const iso = (ms) => new Date(ms).toISOString()
const NOW = iso(Date.now())

function docs(partial = {}) {
  return {tasks: [], tags: [], branches: [], files: [], events: [], settings: null, ...partial}
}

function branch(id, over = {}) {
  return {id, name: id, created_at: iso(0), updated_at: NOW, deleted_at: null, ...over}
}

function task(id, branchId, over = {}) {
  return {
    id,
    status: "active",
    content: "",
    minimized: false,
    order_index: 0,
    scheduled_date: "2026-01-01",
    scheduled_time: "",
    scheduled_timezone: "UTC",
    estimated_time: 0,
    spent_time: 0,
    branch_id: branchId,
    tags: [],
    attachments: [],
    created_at: iso(0),
    updated_at: NOW,
    deleted_at: null,
    ...over,
  }
}

function assertNoDanglingBranchRefs(merge) {
  const branchIds = new Set(merge.resultDocs.branches.map((b) => b.id))
  for (const t of merge.toUpsert.tasks) {
    expect(branchIds.has(t.branch_id)).toBe(true)
  }
}

describe("mergeRemoteIntoLocal — branch_id integrity", () => {
  it("reassigns a task whose branch was dropped as an expired remote-only tombstone", () => {
    const local = docs({branches: [branch("main")]})
    const remote = docs({
      branches: [branch("main"), branch("proj", {deleted_at: iso(0)})],
      tasks: [task("t1", "proj")],
    })

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.resultDocs.branches.some((b) => b.id === "proj")).toBe(false)
    expect(merge.toUpsert.tasks.find((t) => t.id === "t1")?.branch_id).toBe("main")
    assertNoDanglingBranchRefs(merge)
  })

  it("reassigns tasks off a garbage-collected branch and removes the branch", () => {
    const local = docs({branches: [branch("main"), branch("old", {deleted_at: iso(0)})], tasks: [task("t1", "old")]})
    const remote = docs({branches: [branch("main"), branch("old", {deleted_at: iso(0)})], tasks: [task("t1", "old")]})

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.toRemove.branches).toContain("old")
    expect(merge.resultDocs.tasks.find((t) => t.id === "t1")?.branch_id).toBe("main")
    assertNoDanglingBranchRefs(merge)
  })

  it("keeps a live branch reference and upserts nothing when nothing changed", () => {
    const local = docs({branches: [branch("main"), branch("p1")], tasks: [task("t1", "p1")]})
    const remote = docs({branches: [branch("main"), branch("p1")], tasks: [task("t1", "p1")]})

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.toUpsert.tasks).toEqual([])
    expect(merge.resultDocs.tasks.find((t) => t.id === "t1")?.branch_id).toBe("p1")
  })

  it("preserves a new remote branch so its tasks resolve without reassignment", () => {
    const local = docs({branches: [branch("main")]})
    const remote = docs({branches: [branch("main"), branch("p1")], tasks: [task("t1", "p1")]})

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.toUpsert.branches.some((b) => b.id === "p1")).toBe(true)
    expect(merge.toUpsert.tasks.find((t) => t.id === "t1")?.branch_id).toBe("p1")
    assertNoDanglingBranchRefs(merge)
  })
})
