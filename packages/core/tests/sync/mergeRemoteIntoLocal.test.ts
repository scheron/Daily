// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mergeRemoteIntoLocal} from "../../src/utils/sync/merge/mergeRemoteIntoLocal"

const GC = 7 * 24 * 60 * 60 * 1000
const iso = (ms) => new Date(ms).toISOString()
const NOW = iso(Date.now())

function docs(partial = {}) {
  return {tasks: [], tags: [], branches: [], milestones: [], files: [], events: [], settings: null, ...partial}
}

function branch(id, over = {}) {
  return {id, name: id, description: "", created_at: iso(0), updated_at: NOW, deleted_at: null, ...over}
}

function milestone(id, branchId, over = {}) {
  return {
    id,
    branch_id: branchId,
    name: id,
    description: "",
    target_date: null,
    order_index: 0,
    created_at: iso(0),
    updated_at: NOW,
    deleted_at: null,
    ...over,
  }
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

function assertNoDanglingMilestoneRefs(merge) {
  const milestoneIds = new Set(merge.resultDocs.milestones.map((m) => m.id))
  for (const t of [...merge.resultDocs.tasks, ...merge.toUpsert.tasks]) {
    if (!t.milestone_id) continue
    expect(milestoneIds.has(t.milestone_id)).toBe(true)
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

  it("drops a tag and a milestone off a garbage-collected branch instead of passing them through", () => {
    const deadBranch = branch("old", {deleted_at: iso(0)})
    const tagOnDeadBranch = {id: "tag1", branch_id: "old", name: "bug", color: "#ff0000", created_at: iso(0), updated_at: NOW, deleted_at: null}
    const state = () =>
      docs({
        branches: [branch("main"), deadBranch],
        tags: [tagOnDeadBranch],
        milestones: [milestone("m1", "old")],
        tasks: [task("t1", "old", {milestone_id: "m1"})],
      })

    const merge = mergeRemoteIntoLocal(state(), state(), "pull", GC)

    expect(merge.toRemove.branches).toContain("old")
    expect(merge.resultDocs.tags.some((t) => t.id === "tag1")).toBe(false)
    expect(merge.resultDocs.milestones.some((m) => m.id === "m1")).toBe(false)
    expect(merge.toUpsert.tags.some((t) => t.branch_id === "old")).toBe(false)
    expect(merge.toUpsert.milestones.some((m) => m.branch_id === "old")).toBe(false)
    expect(merge.resultDocs.tasks.find((t) => t.id === "t1")?.branch_id).toBe("main")
    expect(merge.resultDocs.tasks.find((t) => t.id === "t1")?.milestone_id).toBeNull()
    expect(merge.toUpsert.tasks.find((t) => t.id === "t1")?.milestone_id).toBeNull()
    assertNoDanglingMilestoneRefs(merge)
    expect(merge.changes).toBe(3)
  })

  it("clears a milestone_id the remote still names after the milestone stopped existing", () => {
    const local = docs({branches: [branch("main")], tasks: [task("t1", "main")]})
    const remote = docs({branches: [branch("main")], tasks: [task("t1", "main", {milestone_id: "m1"})]})

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.resultDocs.tasks.find((t) => t.id === "t1")?.milestone_id).toBeNull()
    expect(merge.toUpsert.tasks.find((t) => t.id === "t1")?.milestone_id).toBeNull()
    assertNoDanglingMilestoneRefs(merge)
  })

  it("keeps a milestone_id whose milestone survived the merge", () => {
    const state = () =>
      docs({
        branches: [branch("main"), branch("p1")],
        milestones: [milestone("m1", "p1")],
        tasks: [task("t1", "p1", {milestone_id: "m1"})],
      })

    const merge = mergeRemoteIntoLocal(state(), state(), "pull", GC)

    expect(merge.resultDocs.tasks.find((t) => t.id === "t1")?.milestone_id).toBe("m1")
    assertNoDanglingMilestoneRefs(merge)
  })

  it("keeps a tag and a milestone whose branch survived the merge", () => {
    const tagOnLiveBranch = {id: "tag1", branch_id: "p1", name: "bug", color: "#ff0000", created_at: iso(0), updated_at: NOW, deleted_at: null}
    const local = docs({branches: [branch("main"), branch("p1")], tags: [tagOnLiveBranch], milestones: [milestone("m1", "p1")]})
    const remote = docs({branches: [branch("main"), branch("p1")], tags: [tagOnLiveBranch], milestones: [milestone("m1", "p1")]})

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.resultDocs.tags.some((t) => t.id === "tag1")).toBe(true)
    expect(merge.resultDocs.milestones.some((m) => m.id === "m1")).toBe(true)
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

describe("mergeRemoteIntoLocal — a tie resolved by direction reaches the local write", () => {
  const CONTESTED_ID = "contested"
  const OTHER_ID = "unchanged"

  function tiedState() {
    const local = docs({
      branches: [branch("main")],
      tasks: [task(CONTESTED_ID, "main", {content: "this Mac's edit"}), task(OTHER_ID, "main", {content: "same on both sides"})],
    })
    const remote = docs({
      branches: [branch("main")],
      tasks: [task(CONTESTED_ID, "main", {content: "the target's edit"}), task(OTHER_ID, "main", {content: "same on both sides"})],
    })
    return {local, remote}
  }

  it("carries_TC-18_the_targets_content_into_the_local_write_when_pull_resolves_a_tie", () => {
    const {local, remote} = tiedState()

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.changes).toBeGreaterThan(0)
    const written = merge.toUpsert.tasks.find((t) => t.id === CONTESTED_ID)
    expect(written?.content).toBe("the target's edit")
    expect(merge.toUpsert.tasks.some((t) => t.id === OTHER_ID)).toBe(false)
  })

  it("keeps_TC-18_this_Macs_content_and_reports_no_local_write_when_push_resolves_the_same_tie", () => {
    const {local, remote} = tiedState()

    const merge = mergeRemoteIntoLocal(local, remote, "push", GC)

    expect(merge.changes).toBe(0)
    expect(merge.toUpsert.tasks.some((t) => t.id === CONTESTED_ID)).toBe(false)
    expect(merge.toUpsert.tasks.some((t) => t.id === OTHER_ID)).toBe(false)
    expect(merge.resultDocs.tasks.find((t) => t.id === CONTESTED_ID)?.content).toBe("this Mac's edit")
  })

  it("reports_TC-18_no_changes_at_all_when_both_sides_are_already_byte-identical", () => {
    const local = docs({
      branches: [branch("main")],
      tasks: [task(CONTESTED_ID, "main", {content: "agreed everywhere"})],
    })
    const remote = docs({
      branches: [branch("main")],
      tasks: [task(CONTESTED_ID, "main", {content: "agreed everywhere"})],
    })

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.changes).toBe(0)
    expect(merge.toUpsert.tasks).toEqual([])
  })
})

describe("mergeRemoteIntoLocal — milestones merge LWW like every other collection", () => {
  it("carries_TC-18_a_milestone_only_one_side_holds_onto_the_other_regardless_of_direction", () => {
    const local = docs({branches: [branch("main")], milestones: [milestone("m1", "main", {name: "Local only"})]})
    const remote = docs({branches: [branch("main")], milestones: []})

    const pulled = mergeRemoteIntoLocal(local, remote, "pull", GC)
    expect(pulled.resultDocs.milestones.some((m) => m.id === "m1")).toBe(true)

    const pushed = mergeRemoteIntoLocal(local, remote, "push", GC)
    expect(pushed.resultDocs.milestones.some((m) => m.id === "m1")).toBe(true)
  })

  it("settles_TC-18_a_conflicting_milestone_on_the_later_updated_at_on_both_sides", () => {
    const local = docs({branches: [branch("main")], milestones: [milestone("m1", "main", {name: "older", updated_at: iso(1000)})]})
    const remote = docs({branches: [branch("main")], milestones: [milestone("m1", "main", {name: "newer", updated_at: iso(2000)})]})

    const pulled = mergeRemoteIntoLocal(local, remote, "pull", GC)
    expect(pulled.resultDocs.milestones.find((m) => m.id === "m1")?.name).toBe("newer")

    const pushed = mergeRemoteIntoLocal(local, remote, "push", GC)
    expect(pushed.resultDocs.milestones.find((m) => m.id === "m1")?.name).toBe("newer")
  })
})

describe("mergeRemoteIntoLocal — a version-5 snapshot from before this plan", () => {
  it("merges_TC-19_a_remote_missing_milestones_tag_branch_id_and_branch_description_without_throwing", () => {
    const local = docs({branches: [branch("main")]})
    const remoteBeforeMilestones = {
      tasks: [],
      tags: [{id: "tag1", name: "bug", color: "#ff0000", created_at: iso(0), updated_at: NOW, deleted_at: null}],
      branches: [{id: "main", name: "main", created_at: iso(0), updated_at: iso(0), deleted_at: null}],
      files: [],
      events: [],
      settings: null,
    }

    expect(() => mergeRemoteIntoLocal(local, remoteBeforeMilestones, "pull", GC)).not.toThrow()

    const merge = mergeRemoteIntoLocal(local, remoteBeforeMilestones, "pull", GC)
    expect(merge.resultDocs.tags.find((t) => t.id === "tag1")?.branch_id).toBe("main")
    expect(merge.resultDocs.branches.find((b) => b.id === "main")?.description).toBe("")
  })

  it("keeps_TC-19_local_milestones_alive_when_the_remote_carries_no_milestones_key_at_all", () => {
    const local = docs({branches: [branch("main")], milestones: [milestone("m1", "main")]})
    const remoteBeforeMilestones = {
      tasks: [],
      tags: [],
      branches: [branch("main")],
      files: [],
      events: [],
      settings: null,
    }

    const merge = mergeRemoteIntoLocal(local, remoteBeforeMilestones, "pull", GC)

    expect(merge.resultDocs.milestones.some((m) => m.id === "m1")).toBe(true)
  })
})
