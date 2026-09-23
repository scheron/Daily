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
