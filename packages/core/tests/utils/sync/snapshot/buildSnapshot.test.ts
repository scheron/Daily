// @ts-nocheck
import {describe, expect, it} from "vitest"

import {buildSnapshot, buildSnapshotMeta} from "@core/utils/sync/snapshot/buildSnapshot"

function emptyDocs() {
  return {tasks: [], tags: [], branches: [], files: [], events: []}
}

function makeTask(id, overrides = {}) {
  return {
    id,
    status: "active",
    content: "test",
    minimized: false,
    order_index: 0,
    scheduled_date: "2026-03-25",
    scheduled_time: "",
    scheduled_timezone: "UTC",
    estimated_time: 0,
    spent_time: 0,
    branch_id: "main",
    tags: [],
    attachments: [],
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  }
}

function makeRelation(id, overrides = {}) {
  return {
    id,
    blocker_id: "a",
    blocked_id: "b",
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  }
}

function makeTag(id, overrides = {}) {
  return {
    id,
    name: "tag",
    color: "#ff0000",
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  }
}

describe("buildSnapshot", () => {
  it("creates snapshot with version 9", () => {
    const snapshot = buildSnapshot(emptyDocs())
    expect(snapshot.version).toBe(9)
  })

  it("builds version 9 snapshots whose hash moves when a relation's blocked_id changes", () => {
    const docsA = {...emptyDocs(), relations: [makeRelation("r1", {blocked_id: "b"})]}
    const docsB = {...emptyDocs(), relations: [makeRelation("r1", {blocked_id: "c"})]}

    const snapshotA = buildSnapshot(docsA)
    const snapshotB = buildSnapshot(docsB)

    expect(snapshotA.version).toBe(9)
    expect(snapshotB.version).toBe(9)
    expect(snapshotA.meta.hash).not.toBe(snapshotB.meta.hash)
  })

  it("includes docs and meta", () => {
    const docs = emptyDocs()
    const snapshot = buildSnapshot(docs)
    expect(snapshot.docs).toBe(docs)
    expect(snapshot.meta).toBeDefined()
    expect(snapshot.meta.updatedAt).toBeDefined()
    expect(snapshot.meta.hash).toBeDefined()
  })

  it("meta has updatedAt and hash", () => {
    const meta = buildSnapshotMeta(emptyDocs())
    expect(typeof meta.updatedAt).toBe("string")
    expect(typeof meta.hash).toBe("string")
    expect(meta.hash.length).toBe(64) // sha256 hex
  })
})

describe("buildSnapshotMeta", () => {
  it("hash is deterministic for same data", () => {
    const docs = {...emptyDocs(), tasks: [makeTask("t1")]}
    const hash1 = buildSnapshotMeta(docs).hash
    const hash2 = buildSnapshotMeta(docs).hash
    expect(hash1).toBe(hash2)
  })

  it("hash changes when any collection changes", () => {
    const base = emptyDocs()
    const hashEmpty = buildSnapshotMeta(base).hash

    const withTask = {...emptyDocs(), tasks: [makeTask("t1")]}
    const hashTask = buildSnapshotMeta(withTask).hash
    expect(hashTask).not.toBe(hashEmpty)

    const withTag = {...emptyDocs(), tags: [makeTag("tag1")]}
    const hashTag = buildSnapshotMeta(withTag).hash
    expect(hashTag).not.toBe(hashEmpty)
    expect(hashTag).not.toBe(hashTask)
  })

  it("hash ignores a settings document left over from an older snapshot", () => {
    const hashWithout = buildSnapshotMeta(emptyDocs()).hash

    const withSettings = {
      ...emptyDocs(),
      settings: {id: "default", version: "1", updated_at: "2026-03-25T00:00:00.000Z", created_at: "2026-03-25T00:00:00.000Z"},
    }
    expect(buildSnapshotMeta(withSettings).hash).toBe(hashWithout)
  })

  it("sort order of docs does not affect hash", () => {
    const docs1 = {...emptyDocs(), tasks: [makeTask("a"), makeTask("b")]}
    const docs2 = {...emptyDocs(), tasks: [makeTask("b"), makeTask("a")]}
    expect(buildSnapshotMeta(docs1).hash).toBe(buildSnapshotMeta(docs2).hash)
  })
})
