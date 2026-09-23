// @ts-nocheck
import {describe, expect, it} from "vitest"

import {APP_CONFIG} from "@daily/protocol"

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

function relation(id, blockerId, blockedId, over = {}) {
  return {id, blocker_id: blockerId, blocked_id: blockedId, created_at: iso(0), updated_at: NOW, deleted_at: null, ...over}
}

function comment(id, taskId, branchId, over = {}) {
  return {
    id,
    task_id: taskId,
    branch_id: branchId,
    content: id,
    origin: null,
    created_at: iso(0),
    updated_at: NOW,
    deleted_at: null,
    ...over,
  }
}

function event(id, taskId, branchId, over = {}) {
  return {
    id,
    task_id: taskId,
    branch_id: branchId,
    type: "completed",
    event_date: "2026-01-01",
    from_date: null,
    to_date: null,
    created_at: iso(0),
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

describe("mergeRemoteIntoLocal — relations", () => {
  const RECENT = NOW

  it("passes_TC-9_a_relation_through_untouched_when_the_remote_is_a_version-5_snapshot_with_no_relations_key", () => {
    const local = docs({
      branches: [branch("main")],
      tasks: [task("x", "main"), task("y", "main")],
      relations: [relation("r1", "x", "y", {updated_at: iso(1000)})],
    })
    const remoteBeforeRelations = {
      tasks: [task("x", "main"), task("y", "main")],
      tags: [],
      branches: [branch("main")],
      milestones: [],
      files: [],
      events: [],
      settings: null,
    }

    const merge = mergeRemoteIntoLocal(local, remoteBeforeRelations, "pull", GC)

    expect(merge.resultDocs.relations.find((r) => r.id === "r1")).toEqual(relation("r1", "x", "y", {updated_at: iso(1000)}))
  })

  it("lets_TC-9_a_newer_remote_tombstone_win_the_LWW_merge_over_an_older_local_relation", () => {
    const t1 = iso(Date.now() - 2000)
    const t2 = iso(Date.now() - 1000)
    const local = docs({
      branches: [branch("main")],
      tasks: [task("x", "main"), task("y", "main")],
      relations: [relation("r1", "x", "y", {updated_at: t1})],
    })
    const remote = docs({
      branches: [branch("main")],
      tasks: [task("x", "main"), task("y", "main")],
      relations: [relation("r1", "x", "y", {updated_at: t2, deleted_at: t2})],
    })

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.resultDocs.relations.find((r) => r.id === "r1")?.deleted_at).toBe(t2)
  })

  it("tombstones_TC-9_a_live_relation_in_the_upsert_when_its_blocked_task_is_soft-deleted", () => {
    const state = () =>
      docs({
        branches: [branch("main")],
        tasks: [task("x", "main"), task("y", "main", {deleted_at: RECENT})],
        relations: [relation("r1", "x", "y", {updated_at: iso(300)})],
      })

    const merge = mergeRemoteIntoLocal(state(), state(), "pull", GC)

    expect(merge.toUpsert.relations.find((r) => r.id === "r1")?.deleted_at).toBeTruthy()
    expect(merge.resultDocs.relations.find((r) => r.id === "r1")?.deleted_at).toBeTruthy()
  })

  it("tombstones_TC-9_a_live_relation_in_the_upsert_when_its_two_tasks_end_up_in_different_projects", () => {
    const state = () =>
      docs({
        branches: [branch("main"), branch("proj")],
        tasks: [task("x", "proj"), task("y", "main")],
        relations: [relation("r1", "x", "y", {updated_at: iso(300)})],
      })

    const merge = mergeRemoteIntoLocal(state(), state(), "pull", GC)

    expect(merge.toUpsert.relations.find((r) => r.id === "r1")?.deleted_at).toBeTruthy()
    expect(merge.resultDocs.relations.find((r) => r.id === "r1")?.deleted_at).toBeTruthy()
  })

  it("drops_TC-9_a_relation_from_the_result_and_names_it_in_toRemove_when_one_of_its_tasks_is_entirely_absent", () => {
    const state = () =>
      docs({
        branches: [branch("main")],
        tasks: [task("x", "main")],
        relations: [relation("r1", "x", "y", {updated_at: iso(300)})],
      })

    const merge = mergeRemoteIntoLocal(state(), state(), "pull", GC)

    expect(merge.resultDocs.relations.some((r) => r.id === "r1")).toBe(false)
    expect(merge.toRemove.relations).toContain("r1")
  })
})

describe("mergeRemoteIntoLocal — comments", () => {
  it("passes_a_comment_through_untouched_when_the_remote_is_a_version-7_snapshot_with_no_comments_key", () => {
    const local = docs({
      branches: [branch("main")],
      tasks: [task("x", "main")],
      comments: [comment("c1", "x", "main", {updated_at: iso(1000)})],
    })
    const remoteBeforeComments = {
      tasks: [task("x", "main")],
      tags: [],
      branches: [branch("main")],
      milestones: [],
      relations: [],
      files: [],
      events: [],
      settings: null,
    }

    const merge = mergeRemoteIntoLocal(local, remoteBeforeComments, "pull", GC)

    expect(merge.resultDocs.comments).toEqual([comment("c1", "x", "main", {updated_at: iso(1000)})])
  })

  it("reads_a_remote_with_no_comments_key_at_all_as_an_empty_collection_rather_than_throwing", () => {
    const remoteBeforeComments = {tasks: [], tags: [], branches: [], milestones: [], relations: [], files: [], events: [], settings: null}

    const merge = mergeRemoteIntoLocal(docs(), remoteBeforeComments, "pull", GC)

    expect(merge.resultDocs.comments).toEqual([])
    expect(merge.toUpsert.comments).toEqual([])
  })

  it("lets_the_later_updated_at_win_whichever_side_holds_it", () => {
    const older = iso(Date.now() - 2000)
    const newer = iso(Date.now() - 1000)
    const state = (localContent, localAt, remoteContent, remoteAt) => ({
      local: docs({
        branches: [branch("main")],
        tasks: [task("x", "main")],
        comments: [comment("c1", "x", "main", {content: localContent, updated_at: localAt})],
      }),
      remote: docs({
        branches: [branch("main")],
        tasks: [task("x", "main")],
        comments: [comment("c1", "x", "main", {content: remoteContent, updated_at: remoteAt})],
      }),
    })

    const remoteWins = state("from A", older, "from B", newer)
    expect(mergeRemoteIntoLocal(remoteWins.local, remoteWins.remote, "pull", GC).resultDocs.comments[0].content).toBe("from B")

    const localWins = state("from A", newer, "from B", older)
    expect(mergeRemoteIntoLocal(localWins.local, localWins.remote, "pull", GC).resultDocs.comments[0].content).toBe("from A")
  })

  it("lets_a_newer_remote_tombstone_win_over_an_older_live_local_comment", () => {
    const older = iso(Date.now() - 2000)
    const deletedAt = iso(Date.now() - 1000)
    const local = docs({
      branches: [branch("main")],
      tasks: [task("x", "main")],
      comments: [comment("c1", "x", "main", {updated_at: older})],
    })
    const remote = docs({
      branches: [branch("main")],
      tasks: [task("x", "main")],
      comments: [comment("c1", "x", "main", {updated_at: deletedAt, deleted_at: deletedAt})],
    })

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.resultDocs.comments.find((c) => c.id === "c1")?.deleted_at).toBe(deletedAt)
  })

  it("keeps_a_live_local_comment_when_its_own_updated_at_is_newer_than_the_remote_tombstone", () => {
    const deletedAt = iso(Date.now() - 2000)
    const editedAt = iso(Date.now() - 1000)
    const local = docs({
      branches: [branch("main")],
      tasks: [task("x", "main")],
      comments: [comment("c1", "x", "main", {content: "edited after the delete", updated_at: editedAt})],
    })
    const remote = docs({
      branches: [branch("main")],
      tasks: [task("x", "main")],
      comments: [comment("c1", "x", "main", {updated_at: deletedAt, deleted_at: deletedAt})],
    })

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    const merged = merge.resultDocs.comments.find((c) => c.id === "c1")
    expect(merged?.deleted_at).toBeNull()
    expect(merged?.content).toBe("edited after the delete")
  })

  it("settles_a_tie_on_the_direction_of_the_sync_taking_the_remote_on_pull_and_keeping_this_Macs_on_push", () => {
    const tie = NOW
    const local = () =>
      docs({
        branches: [branch("main")],
        tasks: [task("x", "main")],
        comments: [comment("c1", "x", "main", {content: "from A", updated_at: tie})],
      })
    const remote = () =>
      docs({
        branches: [branch("main")],
        tasks: [task("x", "main")],
        comments: [comment("c1", "x", "main", {content: "from B", updated_at: tie})],
      })

    const pulled = mergeRemoteIntoLocal(local(), remote(), "pull", GC)
    expect(pulled.resultDocs.comments[0].content).toBe("from B")
    expect(pulled.toUpsert.comments.find((c) => c.id === "c1")?.content).toBe("from B")

    const pushed = mergeRemoteIntoLocal(local(), remote(), "push", GC)
    expect(pushed.resultDocs.comments[0].content).toBe("from A")
  })

  it("keeps_a_comment_whose_task_is_only_soft-deleted_so_restoring_the_task_restores_its_thread", () => {
    const state = () =>
      docs({
        branches: [branch("main")],
        tasks: [task("x", "main", {deleted_at: NOW})],
        comments: [comment("c1", "x", "main", {updated_at: iso(300)})],
      })

    const merge = mergeRemoteIntoLocal(state(), state(), "pull", GC)

    expect(merge.resultDocs.comments.find((c) => c.id === "c1")?.deleted_at).toBeNull()
    expect(merge.toRemove.comments ?? []).not.toContain("c1")
  })

  it("drops_a_comment_from_the_result_and_names_it_in_toRemove_when_its_task_is_entirely_absent", () => {
    const state = () =>
      docs({
        branches: [branch("main")],
        tasks: [task("x", "main")],
        comments: [comment("c1", "x", "main", {updated_at: iso(300)}), comment("c2", "gone", "main", {updated_at: iso(300)})],
      })

    const merge = mergeRemoteIntoLocal(state(), state(), "pull", GC)

    expect(merge.resultDocs.comments.map((c) => c.id)).toEqual(["c1"])
    expect(merge.toRemove.comments).toContain("c2")
    expect(merge.toUpsert.comments.map((c) => c.id)).not.toContain("c2")
  })

  it("re-points_a_comment_at_the_project_its_task_ended_up_in_without_touching_its_updated_at", () => {
    const updatedAt = iso(300)
    const state = () =>
      docs({
        branches: [branch("main")],
        tasks: [task("x", "gone-project")],
        comments: [comment("c1", "x", "gone-project", {updated_at: updatedAt})],
      })

    const merge = mergeRemoteIntoLocal(state(), state(), "pull", GC)

    const merged = merge.resultDocs.comments.find((c) => c.id === "c1")
    expect(merged?.branch_id).toBe("main")
    expect(merged?.updated_at).toBe(updatedAt)
    expect(merge.toUpsert.comments.find((c) => c.id === "c1")?.branch_id).toBe("main")
  })

  it("garbage-collects_an_expired_comment_tombstone_the_way_every_other_collection_is_collected", () => {
    const longGone = iso(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const state = () =>
      docs({
        branches: [branch("main")],
        tasks: [task("x", "main")],
        comments: [comment("c1", "x", "main", {updated_at: longGone, deleted_at: longGone})],
      })

    const merge = mergeRemoteIntoLocal(state(), state(), "pull", GC)

    expect(merge.resultDocs.comments).toEqual([])
    expect(merge.toRemove.comments).toContain("c1")
  })
})

describe("mergeRemoteIntoLocal — event actor", () => {
  it("TC-4: a remote event with no author columns normalises to manual/null, and the merge loses none of them", () => {
    const local = docs({branches: [branch("main")], tasks: [task("t1", "main")]})
    const remote = docs({
      branches: [branch("main")],
      tasks: [task("t1", "main")],
      events: [event("e1", "t1", "main", {type: "completed"}), event("e2", "t1", "main", {type: "edited"})],
    })

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    expect(merge.resultDocs.events.map((e) => e.id).sort()).toEqual(["e1", "e2"])
    expect(merge.resultDocs.events.every((e) => e.kind === "manual" && e.provider === null)).toBe(true)
  })
})

describe("mergeRemoteIntoLocal — a version-9 snapshot carrying task attachments", () => {
  function link(id) {
    return `${APP_CONFIG.filesProtocol}/${id}`
  }

  it("TC-8: folds an unmentioned attachment into the task's content, leaves an already-mentioned one alone, and drops the attachments field", () => {
    const local = docs({branches: [branch("main")]})
    const remote = {
      tasks: [
        task("t1", "main", {content: "Unmentioned", attachments: ["file1"]}),
        task("t2", "main", {content: `Already has ![shot](${link("file2")})`, attachments: ["file2"]}),
      ],
      tags: [],
      branches: [branch("main")],
      milestones: [],
      relations: [],
      comments: [],
      files: [
        {id: "file1", name: "one.png", mime_type: "image/png", size: 10, created_at: iso(0), updated_at: NOW, deleted_at: null},
        {id: "file2", name: "shot.png", mime_type: "image/png", size: 10, created_at: iso(0), updated_at: NOW, deleted_at: null},
      ],
      events: [],
      settings: null,
    }

    const merge = mergeRemoteIntoLocal(local, remote, "pull", GC)

    const t1 = merge.resultDocs.tasks.find((t) => t.id === "t1")
    expect(t1.content).toContain("Unmentioned")
    expect(t1.content).toContain(link("file1"))
    expect(t1.attachments).toBeUndefined()

    const t2 = merge.resultDocs.tasks.find((t) => t.id === "t2")
    expect(t2.content).toBe(`Already has ![shot](${link("file2")})`)
    const file2Mentions = t2.content.split(link("file2")).length - 1
    expect(file2Mentions).toBe(1)
    expect(t2.attachments).toBeUndefined()
  })
})
