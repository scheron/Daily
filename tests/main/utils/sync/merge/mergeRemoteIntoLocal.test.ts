// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mergeRemoteIntoLocal} from "@main/utils/sync/merge/mergeRemoteIntoLocal"

const ONE_DAY = 86_400_000
const GC_INTERVAL = 7 * ONE_DAY

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    status: "active",
    content: "Task",
    minimized: false,
    order_index: 1024,
    scheduled_date: "2026-03-24",
    scheduled_time: "",
    scheduled_timezone: "UTC",
    estimated_time: 0,
    spent_time: 0,
    branch_id: "main",
    tags: [],
    attachments: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  }
}

function makeTag(overrides = {}) {
  return {
    id: "tag-1",
    name: "work",
    color: "#000",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  }
}

function makeBranch(overrides = {}) {
  return {
    id: "branch-1",
    name: "Feature",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  }
}

function makeSettings(overrides = {}) {
  return {
    id: "settings",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    branch: {activeId: "main"},
    sync: {enabled: false, path: ""},
    theme: {mode: "light", palette: "default"},
    ...overrides,
  }
}

function emptyDocs(overrides = {}) {
  return {tasks: [], tags: [], branches: [], files: [], settings: null, ...overrides}
}

describe("mergeRemoteIntoLocal", () => {
  it("returns 0 changes when local and remote are identical", () => {
    const task = makeTask()
    const local = emptyDocs({tasks: [task]})
    const remote = emptyDocs({tasks: [task]})

    const {changes} = mergeRemoteIntoLocal(local, remote, "pull", GC_INTERVAL)

    expect(changes).toBe(0)
  })

  it("detects new remote task as a change", () => {
    const local = emptyDocs()
    const remote = emptyDocs({tasks: [makeTask({id: "new-task"})]})

    const {changes, toUpsert} = mergeRemoteIntoLocal(local, remote, "pull", GC_INTERVAL)

    expect(changes).toBeGreaterThan(0)
    expect(toUpsert.tasks).toHaveLength(1)
  })

  it("remote newer task wins (pull strategy)", () => {
    const local = emptyDocs({tasks: [makeTask({id: "1", updated_at: "2026-01-01T00:00:00.000Z", content: "old"})]})
    const remote = emptyDocs({tasks: [makeTask({id: "1", updated_at: "2026-06-01T00:00:00.000Z", content: "new"})]})

    const {resultDocs} = mergeRemoteIntoLocal(local, remote, "pull", GC_INTERVAL)

    expect(resultDocs.tasks[0].content).toBe("new")
  })

  it("local newer task wins regardless of strategy", () => {
    const local = emptyDocs({tasks: [makeTask({id: "1", updated_at: "2026-06-01T00:00:00.000Z", content: "local"})]})
    const remote = emptyDocs({tasks: [makeTask({id: "1", updated_at: "2026-01-01T00:00:00.000Z", content: "remote"})]})

    const {resultDocs} = mergeRemoteIntoLocal(local, remote, "push", GC_INTERVAL)

    expect(resultDocs.tasks[0].content).toBe("local")
  })

  it("reassigns tasks from GC'd branches to main", () => {
    const oldDeletedAt = new Date(Date.now() - GC_INTERVAL - ONE_DAY).toISOString()
    const deletedBranch = makeBranch({id: "dead-branch", deleted_at: oldDeletedAt, updated_at: oldDeletedAt})
    const task = makeTask({id: "t1", branch_id: "dead-branch"})

    const local = emptyDocs({tasks: [task], branches: [deletedBranch]})
    const remote = emptyDocs()

    const {resultDocs} = mergeRemoteIntoLocal(local, remote, "pull", GC_INTERVAL)

    const mergedTask = resultDocs.tasks.find((t) => t.id === "t1")
    expect(mergedTask?.branch_id).toBe("main")
  })

  it("merges settings using LWW — remote wins when newer", () => {
    const local = emptyDocs({settings: makeSettings({updated_at: "2026-01-01T00:00:00.000Z"})})
    const remote = emptyDocs({settings: makeSettings({updated_at: "2026-06-01T00:00:00.000Z", branch: {activeId: "feature"}})})

    const {resultDocs, toUpsert} = mergeRemoteIntoLocal(local, remote, "pull", GC_INTERVAL)

    expect(resultDocs.settings?.branch.activeId).toBe("feature")
    expect(toUpsert.settings).not.toBeNull()
  })

  it("includes toRemove for GC'd items", () => {
    const oldDeletedAt = new Date(Date.now() - GC_INTERVAL - ONE_DAY).toISOString()
    const task = makeTask({id: "gc-task", deleted_at: oldDeletedAt, updated_at: oldDeletedAt})

    const local = emptyDocs({tasks: [task]})
    const remote = emptyDocs()

    const {toRemove} = mergeRemoteIntoLocal(local, remote, "pull", GC_INTERVAL)

    expect(toRemove.tasks).toContain("gc-task")
  })

  it("merges tags correctly", () => {
    const localTag = makeTag({id: "t1", updated_at: "2026-01-01T00:00:00.000Z", name: "old"})
    const remoteTag = makeTag({id: "t1", updated_at: "2026-06-01T00:00:00.000Z", name: "new"})

    const local = emptyDocs({tags: [localTag]})
    const remote = emptyDocs({tags: [remoteTag]})

    const {resultDocs} = mergeRemoteIntoLocal(local, remote, "pull", GC_INTERVAL)

    expect(resultDocs.tags[0].name).toBe("new")
  })
})
