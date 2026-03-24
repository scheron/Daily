// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mergeFields} from "@main/utils/sync/merge/FieldMerger"

describe("FieldMerger", () => {
  const T1 = "2026-03-24T10:00:00.000Z"
  const T2 = "2026-03-24T12:00:00.000Z"
  const T3 = "2026-03-24T14:00:00.000Z"

  it("only remote changes — all applied", () => {
    const result = mergeFields(
      [],
      [
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'new'",
          changed_at: T1,
          sequence: 1,
          device_id: "d1",
        },
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "status",
          old_value: null,
          new_value: "'done'",
          changed_at: T1,
          sequence: 2,
          device_id: "d1",
        },
      ],
      "pull",
    )

    expect(result.patches.length).toBe(1)
    expect(result.patches[0].fields.content).toBe("'new'")
    expect(result.patches[0].fields.status).toBe("'done'")
    expect(result.conflicts.length).toBe(0)
  })

  it("only local changes — nothing in patch", () => {
    const result = mergeFields(
      [
        {
          id: 1,
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'local'",
          changed_at: T1,
          sequence: 1,
          device_id: "d1",
          synced: 0,
        },
      ],
      [],
      "pull",
    )

    expect(result.patches).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it("both changed same field — remote newer wins", () => {
    const result = mergeFields(
      [
        {
          id: 1,
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'local'",
          changed_at: T1,
          sequence: 1,
          device_id: "local-dev",
          synced: 0,
        },
      ],
      [
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'remote'",
          changed_at: T2,
          sequence: 1,
          device_id: "remote-dev",
        },
      ],
      "pull",
    )

    expect(result.patches.length).toBe(1)
    expect(result.patches[0].fields.content).toBe("'remote'")
    expect(result.conflicts.length).toBe(1)
    expect(result.conflicts[0].outcome).toBe("remote_wins")
  })

  it("both changed same field — local newer wins", () => {
    const result = mergeFields(
      [
        {
          id: 1,
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'local'",
          changed_at: T2,
          sequence: 1,
          device_id: "local-dev",
          synced: 0,
        },
      ],
      [
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'remote'",
          changed_at: T1,
          sequence: 1,
          device_id: "remote-dev",
        },
      ],
      "pull",
    )

    expect(result.patches).toEqual([]) // Local preserved, no patch
    expect(result.conflicts.length).toBe(1)
    expect(result.conflicts[0].outcome).toBe("local_wins")
  })

  it("tie-break with strategy=pull — remote wins", () => {
    const result = mergeFields(
      [
        {
          id: 1,
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'local'",
          changed_at: T1,
          sequence: 1,
          device_id: "local-dev",
          synced: 0,
        },
      ],
      [
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'remote'",
          changed_at: T1,
          sequence: 1,
          device_id: "remote-dev",
        },
      ],
      "pull",
    )

    expect(result.patches.length).toBe(1)
    expect(result.patches[0].fields.content).toBe("'remote'")
    expect(result.conflicts[0].outcome).toBe("remote_wins")
  })

  it("tie-break with strategy=push — local wins", () => {
    const result = mergeFields(
      [
        {
          id: 1,
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'local'",
          changed_at: T1,
          sequence: 1,
          device_id: "local-dev",
          synced: 0,
        },
      ],
      [
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'remote'",
          changed_at: T1,
          sequence: 1,
          device_id: "remote-dev",
        },
      ],
      "push",
    )

    expect(result.patches).toEqual([])
    expect(result.conflicts[0].outcome).toBe("local_wins")
  })

  it("different fields on same entity — both preserved", () => {
    const result = mergeFields(
      [
        {
          id: 1,
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "status",
          old_value: null,
          new_value: "'done'",
          changed_at: T1,
          sequence: 1,
          device_id: "local-dev",
          synced: 0,
        },
      ],
      [
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'remote content'",
          changed_at: T1,
          sequence: 1,
          device_id: "remote-dev",
        },
      ],
      "pull",
    )

    // Remote's content field applied, local's status preserved (not in patch)
    expect(result.patches.length).toBe(1)
    expect(result.patches[0].fields.content).toBe("'remote content'")
    expect(result.patches[0].fields.status).toBeUndefined()
    expect(result.conflicts.length).toBe(0)
  })

  it("remote insert — all fields applied", () => {
    const result = mergeFields(
      [],
      [
        {
          doc_id: "t-new",
          entity: "task",
          operation: "insert",
          field_name: "content",
          old_value: null,
          new_value: "'new task'",
          changed_at: T1,
          sequence: 1,
          device_id: "d1",
        },
        {
          doc_id: "t-new",
          entity: "task",
          operation: "insert",
          field_name: "status",
          old_value: null,
          new_value: "'active'",
          changed_at: T1,
          sequence: 2,
          device_id: "d1",
        },
      ],
      "pull",
    )

    expect(result.patches.length).toBe(1)
    expect(result.patches[0].operation).toBe("insert")
    expect(result.patches[0].fields.content).toBe("'new task'")
    expect(result.patches[0].fields.status).toBe("'active'")
  })

  it("remote delete — marked for deletion", () => {
    const result = mergeFields(
      [],
      [
        {
          doc_id: "t-del",
          entity: "task",
          operation: "delete",
          field_name: null,
          old_value: null,
          new_value: null,
          changed_at: T1,
          sequence: 1,
          device_id: "d1",
        },
      ],
      "pull",
    )

    expect(result.patches.length).toBe(1)
    expect(result.patches[0].operation).toBe("delete")
  })

  it("empty remote deltas — empty result", () => {
    const result = mergeFields(
      [
        {
          id: 1,
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'local'",
          changed_at: T1,
          sequence: 1,
          device_id: "d1",
          synced: 0,
        },
      ],
      [],
      "pull",
    )

    expect(result.patches).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it("multiple changes to same field from same device — uses latest", () => {
    const result = mergeFields(
      [],
      [
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'first'",
          changed_at: T1,
          sequence: 1,
          device_id: "d1",
        },
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: "'first'",
          new_value: "'second'",
          changed_at: T2,
          sequence: 2,
          device_id: "d1",
        },
      ],
      "pull",
    )

    expect(result.patches.length).toBe(1)
    expect(result.patches[0].fields.content).toBe("'second'")
  })

  it("mixed entities — each gets its own patch", () => {
    const result = mergeFields(
      [],
      [
        {
          doc_id: "t1",
          entity: "task",
          operation: "update",
          field_name: "content",
          old_value: null,
          new_value: "'task content'",
          changed_at: T1,
          sequence: 1,
          device_id: "d1",
        },
        {
          doc_id: "tag1",
          entity: "tag",
          operation: "update",
          field_name: "name",
          old_value: null,
          new_value: "'work'",
          changed_at: T1,
          sequence: 2,
          device_id: "d1",
        },
        {
          doc_id: "b1",
          entity: "branch",
          operation: "update",
          field_name: "name",
          old_value: null,
          new_value: "'feature'",
          changed_at: T1,
          sequence: 3,
          device_id: "d1",
        },
      ],
      "pull",
    )

    expect(result.patches.length).toBe(3)
    const entities = result.patches.map((p) => p.entity)
    expect(entities).toContain("task")
    expect(entities).toContain("tag")
    expect(entities).toContain("branch")
  })
})
