// @ts-nocheck
import {describe, expect, it} from "vitest"

import {normalizeSnapshotDocs} from "@core/utils/sync/snapshot/normalizeSnapshotDocs"

function legacyDocs(overrides = {}) {
  return {
    tasks: [],
    tags: [],
    branches: [],
    files: [],
    ...overrides,
  }
}

describe("normalizeSnapshotDocs", () => {
  it("defaults events to an empty array on a pre-v5 snapshot that carries no events collection at all", () => {
    const normalized = normalizeSnapshotDocs(legacyDocs())

    expect(normalized.events).toEqual([])
  })

  it("still defaults kind and provider on a snapshot whose events predate the actor columns", () => {
    const docs = legacyDocs({events: [{id: "e1", task_id: "t1", branch_id: "main", type: "created", event_date: "2026-01-01"}]})

    const normalized = normalizeSnapshotDocs(docs)

    expect(normalized.events).toEqual([
      {id: "e1", task_id: "t1", branch_id: "main", type: "created", event_date: "2026-01-01", kind: "manual", provider: null},
    ])
  })
})

it("upgrades old task status keys without changing dates, order, content or event history", () => {
  const task = {id: "t1", status: "active", content: "Keep file link", order_index: 123, scheduled_date: "2026-10-29"}
  const event = {id: "e1", type: "discarded", kind: "manual", provider: null}
  const normalized = normalizeSnapshotDocs(legacyDocs({tasks: [task, {...task, id: "t2", status: "discarded"}], events: [event]}))
  expect(normalized.tasks[0]).toMatchObject({...task, status: "in_progress"})
  expect(normalized.tasks[1].status).toBe("cancelled")
  expect(normalized.events).toEqual([event])
})

it("reads a snapshot from before subtasks as having none", () => {
  expect(normalizeSnapshotDocs(legacyDocs()).subtasks).toEqual([])
})

it("keeps existing planned and executing statuses with their dates during normalization", () => {
  const tasks = ["todo", "in_progress"].map((status) => ({
    id: status,
    status,
    content: "Keep",
    scheduled_date: "2026-10-30",
    milestone_id: null,
    priority: "high",
  }))
  expect(normalizeSnapshotDocs(legacyDocs({tasks})).tasks).toEqual(tasks)
})
