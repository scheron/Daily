import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {FileModel} from "@core/storage/models/FileModel"
import {TaskEventModel} from "@core/storage/models/TaskEventModel"
import {LocalStorageAdapter} from "@core/storage/sync/adapters/LocalStorageAdapter"
import {buildSnapshot} from "@core/utils/sync/snapshot/buildSnapshot"
import {normalizeSnapshotDocs} from "@core/utils/sync/snapshot/normalizeSnapshotDocs"
import {createTestDatabase} from "../helpers/db"

import type {SqliteDriver} from "@core/database/SqliteDriver"
import type {TaskEvent} from "@daily/protocol"

const at = "2026-10-31T00:00:00.000Z"

function makeEvent(overrides: Partial<TaskEvent> = {}) {
  return {
    taskId: "task",
    branchId: "main",
    type: "created" as const,
    eventDate: "2026-10-31",
    fromDate: null,
    toDate: null,
    createdAt: at,
    ...overrides,
  }
}

describe("task event persistence", () => {
  let db: SqliteDriver
  let model: TaskEventModel
  let adapter: LocalStorageAdapter

  beforeEach(() => {
    db = createTestDatabase()
    model = new TaskEventModel(db)
    adapter = new LocalStorageAdapter(db, new FileModel(db, "/tmp/daily-event-persistence"))
  })

  afterEach(() => db.close())

  it("preserves change metadata, authorship and same-instant ordering after reversed snapshot import", async () => {
    model.record(makeEvent({type: "status_changed", fromStatus: "ready_for_agent", toStatus: "in_progress", kind: "mcp", provider: "Codex"}))
    model.record(makeEvent({type: "priority_changed", fromPriority: "none", toPriority: "high"}))
    model.record(makeEvent({type: "project_changed", fromBranchId: "main", toBranchId: "other"}))
    const docs = await adapter.loadAllDocs()
    const priority = docs.events.find((event) => event.type === "priority_changed")!
    await adapter.upsertDocs({
      ...docs,
      events: [{...priority, id: "same-sequence-edit", type: "edited", from_priority: null, to_priority: null}],
    })
    const history = model.getByTask("task")
    expect(history.map((event) => event.sequence)).toEqual([3, 2, 2, 1])
    expect(model.getLatestByTask("task")).toEqual(history[0])
    const snapshot = JSON.parse(JSON.stringify(buildSnapshot(await adapter.loadAllDocs())))
    expect(snapshot.version).toBe(15)

    const remoteDb = createTestDatabase()
    try {
      const remote = new LocalStorageAdapter(remoteDb, new FileModel(remoteDb, "/tmp/daily-event-persistence-other"))
      const reversed = {...snapshot.docs, events: [...snapshot.docs.events].reverse()}
      await remote.upsertDocs(reversed)
      await remote.upsertDocs(snapshot.docs)
      const remoteModel = new TaskEventModel(remoteDb)
      expect(remoteModel.getByTask("task")).toEqual(history)
      expect(remoteModel.getLatestByTask("task")).toEqual(history[0])
    } finally {
      remoteDb.close()
    }
  })

  it("reads legacy events without inventing transition values", async () => {
    const docs = normalizeSnapshotDocs({
      tasks: [],
      tags: [],
      branches: [],
      files: [],
      events: [
        {
          id: "legacy",
          task_id: "task",
          branch_id: "main",
          type: "completed",
          event_date: "2026-10-31",
          from_date: null,
          to_date: null,
          created_at: at,
          kind: "manual",
          provider: null,
        },
      ],
      milestones: [],
      relations: [],
      comments: [],
      subtasks: [],
    })
    await adapter.upsertDocs(docs)
    expect(model.getByTask("task")[0]).toMatchObject({type: "completed", fromStatus: null, toStatus: null, sequence: 0, moveId: null})
    expect(model.listCompletionsBetween()).toEqual([{taskId: "task", at}])
  })

  it("counts old completions and new transitions to Done within the requested half-open range", () => {
    model.record(makeEvent({type: "completed", createdAt: "2026-10-30T00:00:00.000Z"}))
    model.record(makeEvent({type: "status_changed", fromStatus: "in_progress", toStatus: "done"}))
    model.record(makeEvent({type: "status_changed", fromStatus: "done", toStatus: "in_progress"}))
    model.record(makeEvent({type: "status_changed", toStatus: "done", createdAt: "2026-11-01T00:00:00.000Z"}))
    expect(model.listCompletionsBetween(at, "2026-11-01T00:00:00.000Z")).toEqual([{taskId: "task", at}])
    expect(model.listCompletionsBetween()).toHaveLength(3)
  })

  it("counts repeated moves at one instant independently while deduplicating each move's two day rows", () => {
    const move = makeEvent({type: "moved", fromDate: "2026-10-30", toDate: "2026-10-31"})
    for (const moveId of ["first", "second"]) {
      model.record({...move, moveId, eventDate: "2026-10-30"})
      model.record({...move, moveId, eventDate: "2026-10-31"})
    }
    model.record({...move, eventDate: "2026-10-30"})
    model.record({...move, eventDate: "2026-10-31"})
    expect(model.countMovesByTask()).toEqual({task: 3})
  })
})
