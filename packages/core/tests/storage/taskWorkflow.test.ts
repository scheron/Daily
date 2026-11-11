import {afterEach, describe, expect, it, vi} from "vitest"

import {TaskModel} from "@core/storage/models/TaskModel"
import {WorkStorage} from "@core/storage/WorkStorage"
import {makeControllerHarness, makeTaskInput} from "../helpers/storageControllerHarness"

import type {SqliteDriver} from "@core/database/SqliteDriver"
import type {TaskWorkflowHost} from "@core/storage/services/TaskWorkflowService"
import type {Changeset} from "@core/types/storage"
import type {ActorSource, TaskWorkflowCommand, TaskWorkflowContext} from "@daily/protocol"

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function makeWorkflowHarness(host: TaskWorkflowHost = {runtimeId: "runtime-a", now: () => 0, monotonicNow: () => 0}) {
  const harness = makeControllerHarness()
  cleanups.push(() => harness.db.close())
  const storage = new WorkStorage(harness, harness.db, () => {}, host)
  const task = harness.taskModel.createTask(makeTaskInput({status: "ready_for_agent"}))!
  return {...harness, storage, task}
}

describe("task workflow", () => {
  it("rejects legacy agent planning and status writes while preserving human edits", async () => {
    const {storage, tasksService, task} = makeWorkflowHarness()
    await expect(storage.updateTask(task.id, {status: "done"}, {kind: "mcp"})).rejects.toMatchObject({code: "forbidden"})
    await expect(tasksService.updateTask(task.id, {estimatedTime: 60}, {kind: "agent"})).rejects.toMatchObject({code: "forbidden"})
    await storage.updateTask(task.id, {status: "done", estimatedTime: 60})
    expect(await storage.getTask(task.id)).toMatchObject({status: "done", estimatedTime: 60})
  })
})

describe("workflow snapshot storage", () => {
  it("preserves real independent records through both merge directions, hashing and SQLite reconstruction", async () => {
    let now = 0
    let monotonic = 0
    const left = makeWorkflowHarness({runtimeId: "left", now: () => now, monotonicNow: () => monotonic})
    const right = makeWorkflowHarness({runtimeId: "right", now: () => now, monotonicNow: () => monotonic})
    const {mergeRemoteIntoLocal} = await import("@core/utils/sync/merge/mergeRemoteIntoLocal")
    const {buildSnapshotMeta} = await import("@core/utils/sync/snapshot/buildSnapshot")
    const base = await left.localAdapter.loadAllDocs()
    await right.localAdapter.upsertDocs(base)
    async function run(storage: WorkStorage, actorId: string, kind: "start" | "heartbeat" | "pause") {
      const state = await storage.getTaskWorkflow(left.task.id)
      return storage.executeTaskWorkflow(
        {taskId: left.task.id, operationId: `${actorId}-${kind}`, expectedRevision: state.revision, kind, sessionId: actorId},
        {actorId, source: {kind: "mcp"}},
      )
    }
    await run(left.storage, "left", "start")
    now = monotonic = 10000
    await run(right.storage, "right", "start")
    now = monotonic = 30000
    await run(left.storage, "left", "heartbeat")
    now = monotonic = 40000
    await run(right.storage, "right", "pause")
    const leftDocs = {...base, workflowRecords: (await left.localAdapter.loadAllDocs()).workflowRecords}
    const rightDocs = {...base, workflowRecords: (await right.localAdapter.loadAllDocs()).workflowRecords}
    const forward = mergeRemoteIntoLocal(leftDocs, rightDocs, "pull", 100000)
    const reverse = mergeRemoteIntoLocal(rightDocs, leftDocs, "pull", 100000)
    expect(buildSnapshotMeta(leftDocs).hash).not.toBe(buildSnapshotMeta(rightDocs).hash)
    expect(buildSnapshotMeta(forward.resultDocs).hash).toBe(buildSnapshotMeta(reverse.resultDocs).hash)
    await left.localAdapter.upsertDocs(forward.toUpsert)
    await right.localAdapter.upsertDocs(reverse.toUpsert)
    expect((await left.storage.getTaskWorkflow(left.task.id)).confirmedSeconds).toBe(40)
    expect((await right.storage.getTask(left.task.id))?.spentTime).toBe(40)
    const reconstructed = new WorkStorage(left, left.db, () => {}, {runtimeId: "new", now: () => now, monotonicNow: () => monotonic})
    expect((await reconstructed.getTaskWorkflow(left.task.id)).records).toHaveLength(4)
    expect((await reconstructed.getTask(left.task.id))?.spentTime).toBe(40)
  })
})

describe("guarded workflow commands", () => {
  it("keeps planning in its stage, commits implementation once and rejects stale or conflicting operations", async () => {
    const {storage, task, localAdapter} = makeWorkflowHarness()
    const context: TaskWorkflowContext = {actorId: "agent-a", source: {kind: "mcp"}}
    const initial = await storage.getTaskWorkflow(task.id)
    const planning: TaskWorkflowCommand = {
      taskId: task.id,
      operationId: "plan",
      expectedRevision: initial.revision,
      kind: "transition",
      stage: "planning",
    }
    await storage.executeTaskWorkflow(planning, context)
    const planned = await storage.getTaskWorkflow(task.id)
    expect(planned.task.status).toBe("ready_for_agent")
    expect(planned.revision).not.toBe(initial.revision)
    const command: TaskWorkflowCommand = {...planning, operationId: "implement", expectedRevision: planned.revision, stage: "implementation"}
    const receipt = await storage.executeTaskWorkflow(command, context)
    expect((await storage.getTask(task.id))?.status).toBe("in_progress")
    expect(await storage.executeTaskWorkflow(command, context)).toEqual(receipt)
    await expect(storage.executeTaskWorkflow({...command, stage: "ready_to_merge"}, context)).rejects.toMatchObject({code: "conflict"})
    await expect(storage.executeTaskWorkflow({...command, operationId: "stale"}, context)).rejects.toMatchObject({
      code: "stale_revision",
      current: {task: {status: "in_progress"}},
    })
    expect((await localAdapter.loadAllDocs()).workflowRecords).toHaveLength(2)
  })
})

it("rejects a revision observed before a same-millisecond human status ABA", async () => {
  vi.useFakeTimers({toFake: ["Date"]})
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"))
  try {
    const {storage, task} = makeWorkflowHarness()
    const initial = await storage.getTaskWorkflow(task.id)
    await storage.updateTask(task.id, {status: "done"})
    await storage.updateTask(task.id, {status: "ready_for_agent"})
    expect((await storage.getTaskWorkflow(task.id)).revision).not.toBe(initial.revision)
  } finally {
    vi.useRealTimers()
  }
})

it("credits only confirmed intervals and unions overlapping agents without changing the human baseline", async () => {
  let now = 0
  let monotonic = 0
  const {storage, task, db} = makeWorkflowHarness({runtimeId: "runtime-a", now: () => now, monotonicNow: () => monotonic})
  async function run(kind: "start" | "heartbeat" | "pause", actorId: string, sessionId: string) {
    const state = await storage.getTaskWorkflow(task.id)
    return storage.executeTaskWorkflow(
      {taskId: task.id, operationId: `${kind}-${actorId}-${now}`, expectedRevision: state.revision, kind, sessionId},
      {actorId, source: {kind: "mcp"}},
    )
  }
  await run("start", "a", "session-a")
  expect((await storage.getTask(task.id))?.spentTime).toBe(0)
  now = monotonic = 10000
  await run("start", "b", "session-b")
  now = monotonic = 30000
  await run("heartbeat", "a", "session-a")
  expect((await storage.getTask(task.id))?.spentTime).toBe(30)
  now = monotonic = 40000
  await run("pause", "b", "session-b")
  now = monotonic = 50000
  await run("pause", "a", "session-a")
  expect((await storage.getTaskWorkflow(task.id)).confirmedSeconds).toBe(50)
  expect((await storage.getTask(task.id))?.spentTime).toBe(50)
  expect(db.prepare("SELECT spent_time FROM tasks WHERE id = ?").get(task.id)).toEqual({spent_time: 0})
  await storage.updateTask(task.id, {spentTime: 7})
  expect((await storage.getTask(task.id))?.spentTime).toBe(7)
  now = monotonic = 60000
  await run("start", "a", "session-new")
  now = monotonic = 80000
  await run("pause", "a", "session-new")
  expect((await storage.getTask(task.id))?.spentTime).toBe(27)
  await storage.addTaskSpentTime(task.id, 3)
  expect((await storage.getTask(task.id))?.spentTime).toBe(30)
})

it("expires unconfirmed gaps, restart checkpoints and human-edited sessions without granting idle time", async () => {
  let now = 0
  let monotonic = 0
  const {storage, task, db, ...core} = makeWorkflowHarness({runtimeId: "runtime-a", now: () => now, monotonicNow: () => monotonic})
  let operation = 0
  async function run(target: WorkStorage, kind: "start" | "heartbeat" | "pause", sessionId = "session") {
    const state = await target.getTaskWorkflow(task.id)
    return target.executeTaskWorkflow(
      {taskId: task.id, operationId: String(++operation), expectedRevision: state.revision, kind, sessionId},
      {actorId: "a", source: {kind: "mcp"}},
    )
  }
  await run(storage, "start")
  now = monotonic = 60000
  await run(storage, "heartbeat")
  expect((await storage.getTask(task.id))?.spentTime).toBe(60)
  now = monotonic = 120001
  await expect(run(storage, "heartbeat")).rejects.toMatchObject({code: "session_expired"})
  expect((await storage.getTask(task.id))?.spentTime).toBe(60)
  await run(storage, "pause")
  await expect(run(storage, "start")).rejects.toMatchObject({code: "conflict"})
  await run(storage, "start", "second")
  const restarted = new WorkStorage(core, db, () => {}, {runtimeId: "runtime-b", now: () => now, monotonicNow: () => monotonic})
  now += 10000
  monotonic += 10000
  await expect(run(restarted, "heartbeat", "second")).rejects.toMatchObject({code: "session_expired"})
  await run(restarted, "start", "third")
  await storage.updateTask(task.id, {content: "Edited by the person"})
  now += 10000
  monotonic += 10000
  await expect(run(restarted, "heartbeat", "third")).rejects.toMatchObject({code: "session_expired"})
  await run(restarted, "start", "fourth")
  now -= 1
  await expect(run(restarted, "heartbeat", "fourth")).rejects.toMatchObject({code: "session_expired"})
  expect((await storage.getTask(task.id))?.spentTime).toBe(60)
})

it("persists pending proposals and visible reasons without applying or trusting asserted approval", async () => {
  const {storage, task} = makeWorkflowHarness()
  const context: TaskWorkflowContext = {actorId: "a", source: {kind: "mcp"}}
  const initial = await storage.getTaskWorkflow(task.id)
  const command: TaskWorkflowCommand = {
    taskId: task.id,
    operationId: "proposal",
    expectedRevision: initial.revision,
    kind: "propose",
    changes: {estimatedTime: 120, priority: "high", scheduled: {date: "2030-01-02", time: "09:00:00", timezone: "UTC"}},
    reason: "Needs a longer implementation slot",
  }
  const pending = storage.executeTaskWorkflow(command, context)
  await expect(pending).resolves.toMatchObject({taskId: task.id, kind: "propose"})
  const receipt = await pending
  expect((await storage.getTaskWorkflow(task.id)).proposals).toMatchObject([{changes: command.changes, status: "pending", reason: command.reason}])
  expect(await storage.getTask(task.id)).toMatchObject({estimatedTime: 0, priority: "none", scheduled: task.scheduled})
  expect(await storage.getCommentsOfTask(task.id)).toMatchObject([{content: expect.stringContaining(command.reason), kind: "mcp"}])
  expect(await storage.executeTaskWorkflow(command, context)).toEqual(receipt)
  expect(await storage.getCommentsOfTask(task.id)).toHaveLength(1)
  const latest = await storage.getTaskWorkflow(task.id)
  await expect(
    storage.executeTaskWorkflow(
      JSON.parse(JSON.stringify({...command, operationId: "forged", expectedRevision: latest.revision, approved: true})),
      context,
    ),
  ).rejects.toMatchObject({code: "invalid_request"})
  await storage.updateTask(task.id, command.changes)
  expect((await storage.getTaskWorkflow(task.id)).proposals[0].status).toBe("pending")
})

it("blocks legacy creation, implicit move scheduling and restore bypasses while allowing ordinary reorder", async () => {
  const {storage, task, tasksService, taskModel} = makeWorkflowHarness()
  const source: ActorSource = {kind: "mcp"}
  await expect(tasksService.createTask(makeTaskInput({status: "done"}), source)).rejects.toMatchObject({code: "forbidden"})
  await expect(storage.createTask(makeTaskInput({status: "backlog", scheduled: null, priority: "high"}), source)).rejects.toMatchObject({
    code: "forbidden",
  })
  const unscheduled = taskModel.createTask(makeTaskInput({status: "todo", scheduled: null}))!
  await expect(storage.moveTaskByOrder({taskId: unscheduled.id, activeDate: "2030-01-01"}, source)).rejects.toMatchObject({code: "forbidden"})
  await storage.moveTaskByOrder({taskId: task.id, activeDate: task.scheduled!.date}, source)
  const subtask = (await storage.createSubtask(task.id, "A subtask")).subtasks!.upserted![0]
  await expect(storage.makeTaskFromSubtask(subtask.id, source)).rejects.toMatchObject({code: "forbidden"})
  await storage.deleteTask(task.id)
  await expect(storage.restoreTask(task.id, source)).rejects.toMatchObject({code: "forbidden"})
  expect((await storage.restoreTask(task.id)).tasks?.upserted?.[0].deletedAt).toBeNull()
})

it("publishes projected task time when sync pulls only workflow records", async () => {
  let now = 0
  let monotonic = 0
  const sender = makeWorkflowHarness({runtimeId: "sender", now: () => now, monotonicNow: () => monotonic})
  const receiver = makeWorkflowHarness()
  await receiver.localAdapter.upsertDocs(await sender.localAdapter.loadAllDocs())
  const {SyncEngine} = await import("@core/storage/sync/SyncEngine")
  const {buildSnapshot} = await import("@core/utils/sync/snapshot/buildSnapshot")
  let state = await sender.storage.getTaskWorkflow(sender.task.id)
  await sender.storage.executeTaskWorkflow(
    {taskId: sender.task.id, operationId: "start", expectedRevision: state.revision, kind: "start", sessionId: "work"},
    {actorId: "a", source: {kind: "mcp"}},
  )
  now = monotonic = 20000
  state = await sender.storage.getTaskWorkflow(sender.task.id)
  await sender.storage.executeTaskWorkflow(
    {taskId: sender.task.id, operationId: "pause", expectedRevision: state.revision, kind: "pause", sessionId: "work"},
    {actorId: "a", source: {kind: "mcp"}},
  )
  let snapshot = buildSnapshot(await sender.localAdapter.loadAllDocs())
  const changes: Changeset[] = []
  const engine = new SyncEngine(
    receiver.localAdapter,
    [
      {
        id: "test",
        label: "Test",
        adapter: {
          async loadSnapshot() {
            return snapshot
          },
          async saveSnapshot(next) {
            snapshot = next
          },
          async syncAssets() {},
        },
      },
    ],
    {
      assetsDir: () => "unused",
      onStatusChange() {},
      onDataChanged(change) {
        changes.push(change)
      },
    },
  )
  await engine.syncOnce()
  expect(changes.flatMap((change) => change.tasks?.upserted ?? []).find((task) => task.id === sender.task.id)?.spentTime).toBe(20)
  expect((await receiver.storage.getTask(sender.task.id))?.spentTime).toBe(20)
})

it("refuses conflicting immutable record IDs during merge and import instead of diverging", async () => {
  const {storage, task, localAdapter} = makeWorkflowHarness()
  const {mergeRemoteIntoLocal} = await import("@core/utils/sync/merge/mergeRemoteIntoLocal")
  const state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "operation", expectedRevision: state.revision, kind: "transition", stage: "planning"},
    {actorId: "actor", source: {kind: "mcp"}},
  )
  const docs = await localAdapter.loadAllDocs()
  const conflicting = {...docs, workflowRecords: docs.workflowRecords!.map((record) => ({...record, runtimeId: "another-runtime"}))}
  expect(() => mergeRemoteIntoLocal(docs, conflicting, "pull", 100000)).toThrow(expect.objectContaining({code: "conflict"}))
  expect(() => mergeRemoteIntoLocal(conflicting, docs, "pull", 100000)).toThrow(expect.objectContaining({code: "conflict"}))
  await expect(localAdapter.upsertDocs(conflicting)).rejects.toMatchObject({code: "conflict"})
  expect((await storage.getTaskWorkflow(task.id)).records[0].runtimeId).toBe("runtime-a")
})

it("emits the current workflow collection and requires it in snapshots since v17", async () => {
  const {localAdapter} = makeWorkflowHarness()
  const {buildSnapshot} = await import("@core/utils/sync/snapshot/buildSnapshot")
  const {isValidSnapshot} = await import("@core/utils/sync/snapshot/isValidSnapshot")
  const docs = await localAdapter.loadAllDocs()
  const {workflowRecords: _workflowRecords, ...legacy} = docs
  expect(buildSnapshot(legacy).docs.workflowRecords).toEqual([])
  expect(isValidSnapshot(JSON.parse(JSON.stringify({version: 17, docs: legacy, meta: {hash: "h", updatedAt: "now"}})))).toBe(false)
  expect(isValidSnapshot(JSON.parse(JSON.stringify({version: 16, docs: legacy, meta: {hash: "h", updatedAt: "now"}})))).toBe(true)
})

it("returns a committed receipt after resolution and rejects ID reuse even when the replacement task is missing", async () => {
  const {storage, task} = makeWorkflowHarness()
  const initial = await storage.getTaskWorkflow(task.id)
  const command: TaskWorkflowCommand = {
    taskId: task.id,
    operationId: "stable",
    expectedRevision: initial.revision,
    kind: "transition",
    stage: "planning",
  }
  const context: TaskWorkflowContext = {actorId: "a", source: {kind: "mcp"}}
  const receipt = await storage.executeTaskWorkflow(command, context)
  await storage.updateTask(task.id, {status: "done"})
  expect(await storage.executeTaskWorkflow(command, context)).toEqual(receipt)
  await expect(storage.executeTaskWorkflow({...command, taskId: "missing"}, context)).rejects.toMatchObject({code: "conflict", current: null})
})

it("checkpoints a human absolute total against intervals committed before its edit transaction begins", async () => {
  let now = 0
  let monotonic = 0
  const {storage, task, db} = makeWorkflowHarness({runtimeId: "runtime", now: () => now, monotonicNow: () => monotonic})
  const context: TaskWorkflowContext = {actorId: "a", source: {kind: "mcp"}}
  const initial = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "start", expectedRevision: initial.revision, kind: "start", sessionId: "work"},
    context,
  )
  const state = await storage.getTaskWorkflow(task.id)
  let interleaved: Promise<unknown> | null = null
  function commitInterval() {
    if (interleaved) return
    now = monotonic = 10000
    interleaved = storage.executeTaskWorkflow(
      {taskId: task.id, operationId: "pause", expectedRevision: state.revision, kind: "pause", sessionId: "work"},
      context,
    )
  }
  const driver: SqliteDriver = {
    ...db,
    get inTransaction() {
      return db.inTransaction
    },
    exec(sql) {
      if (sql === "BEGIN IMMEDIATE") commitInterval()
      db.exec(sql)
    },
    transaction(fn) {
      return () => {
        if (!db.inTransaction) commitInterval()
        return db.transaction(fn)()
      }
    },
  }

  new TaskModel(driver).updateTask(task.id, {spentTime: 7})
  await interleaved
  expect((await storage.getTask(task.id))?.spentTime).toBe(7)
  expect((await storage.getTaskWorkflow(task.id)).confirmedSeconds).toBe(10)
})

it("reports malformed workflow metadata as domain errors without mutating the ledger", async () => {
  const {storage, task} = makeWorkflowHarness()
  const initial = await storage.getTaskWorkflow(task.id)
  const command: TaskWorkflowCommand = {
    taskId: task.id,
    operationId: "operation",
    expectedRevision: initial.revision,
    kind: "transition",
    stage: "planning",
  }
  const context: TaskWorkflowContext = {actorId: "a", source: {kind: "mcp"}}
  await expect(storage.executeTaskWorkflow(JSON.parse(JSON.stringify({...command, operationId: 42})), context)).rejects.toMatchObject({
    code: "invalid_request",
  })
  await expect(storage.executeTaskWorkflow(JSON.parse(JSON.stringify({...command, kind: "constructor"})), context)).rejects.toMatchObject({
    code: "invalid_request",
  })
  expect((await storage.getTaskWorkflow(task.id)).revision).toBe(initial.revision)
})

it.each([159000, 99999])("forfeits a wall-clock adjustment to %d without adding active-work time", async (adjustedWall) => {
  let wall = 100000
  let monotonic = 0
  const {storage, task} = makeWorkflowHarness({runtimeId: "runtime", now: () => wall, monotonicNow: () => monotonic})
  const start = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "start", expectedRevision: start.revision, kind: "start", sessionId: "work"},
    {actorId: "a", source: {kind: "mcp"}},
  )
  wall = adjustedWall
  monotonic = 10
  const current = await storage.getTaskWorkflow(task.id)
  expect(current.activeSessions[0].expired).toBe(true)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "pause", expectedRevision: current.revision, kind: "pause", sessionId: "work"},
    {actorId: "a", source: {kind: "mcp"}},
  )
  expect((await storage.getTaskWorkflow(task.id)).confirmedSeconds).toBe(0)
})

it("uses one clock observation for a command and rejects gaps above the confirmation bound", async () => {
  let wall = 0
  let monotonic = 0
  let observations = 0
  let monotonicObservations = 0
  const {storage, task} = makeWorkflowHarness({
    runtimeId: "runtime",
    now() {
      observations++
      return wall
    },
    monotonicNow() {
      monotonicObservations++
      return monotonic
    },
  })
  const initial = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "start", expectedRevision: initial.revision, kind: "start", sessionId: "work"},
    {actorId: "a", source: {kind: "mcp"}},
  )
  const state = await storage.getTaskWorkflow(task.id)
  wall = monotonic = 60001
  observations = 0
  monotonicObservations = 0
  await expect(
    storage.executeTaskWorkflow(
      {taskId: task.id, operationId: "heartbeat", expectedRevision: state.revision, kind: "heartbeat", sessionId: "work"},
      {actorId: "a", source: {kind: "mcp"}},
    ),
  ).rejects.toMatchObject({code: "session_expired"})
  expect(observations).toBe(1)
  expect(monotonicObservations).toBe(1)
  expect((await storage.getTaskWorkflow(task.id)).records).toHaveLength(1)
})

it("credits the smaller coherent elapsed time and rejects a regressed monotonic checkpoint", async () => {
  let wall = 0
  let monotonic = 0
  const {storage, task} = makeWorkflowHarness({runtimeId: "runtime", now: () => wall, monotonicNow: () => monotonic})
  async function run(kind: "start" | "heartbeat", operationId: string) {
    const state = await storage.getTaskWorkflow(task.id)
    return storage.executeTaskWorkflow(
      {taskId: task.id, operationId, expectedRevision: state.revision, kind, sessionId: "work"},
      {actorId: "a", source: {kind: "mcp"}},
    )
  }
  await run("start", "start")
  wall = 1000
  monotonic = 999.5
  await run("heartbeat", "beat")
  expect((await storage.getTaskWorkflow(task.id)).confirmedSeconds).toBe(0)
  wall = 1001
  monotonic = 999
  await expect(run("heartbeat", "regress")).rejects.toMatchObject({code: "session_expired"})
})

it("invalidates both revisions and checkpoints after same-millisecond tag edits reverse", async () => {
  vi.useFakeTimers({toFake: ["Date"]})
  try {
    const {storage, task, tagModel, controller} = makeWorkflowHarness()
    const tag = tagModel.createTag({name: "Changed", branchId: "main", color: "red", deletedAt: null})!
    const initial = await storage.getTaskWorkflow(task.id)
    await storage.executeTaskWorkflow(
      {taskId: task.id, operationId: "start", expectedRevision: initial.revision, kind: "start", sessionId: "work"},
      {actorId: "a", source: {kind: "mcp"}},
    )
    const before = await storage.getTaskWorkflow(task.id)
    await controller.addTaskTags(task.id, [tag.id])
    await controller.removeTaskTags(task.id, [tag.id])
    const after = await storage.getTaskWorkflow(task.id)
    expect(after.revision).not.toBe(before.revision)
    expect(after.activeSessions[0].expired).toBe(true)
    await expect(
      storage.executeTaskWorkflow(
        {taskId: task.id, operationId: "stale", expectedRevision: before.revision, kind: "transition", stage: "implementation"},
        {actorId: "a", source: {kind: "mcp"}},
      ),
    ).rejects.toMatchObject({code: "stale_revision"})
  } finally {
    vi.useRealTimers()
  }
})

it("invalidates checkpoints after tag metadata reversals and milestone removal", async () => {
  const {storage, task, taskModel, tagModel, milestoneModel} = makeWorkflowHarness()
  const tag = tagModel.createTag({name: "Original", branchId: "main", color: "red", deletedAt: null})!
  taskModel.addTaskTags(task.id, [tag.id])
  const initial = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "start", expectedRevision: initial.revision, kind: "start", sessionId: "work"},
    {actorId: "a", source: {kind: "mcp"}},
  )
  const before = await storage.getTaskWorkflow(task.id)
  tagModel.updateTag(tag.id, {name: "Other"})
  tagModel.updateTag(tag.id, {name: "Original"})
  expect((await storage.getTaskWorkflow(task.id)).activeSessions[0].expired).toBe(true)
  expect((await storage.getTaskWorkflow(task.id)).revision).not.toBe(before.revision)
  const milestone = milestoneModel.createMilestone({branchId: "main", name: "Scope", description: "", targetDate: null, deletedAt: null})!
  taskModel.updateTask(task.id, {milestoneId: milestone.id})
  const linked = await storage.getTaskWorkflow(task.id)
  milestoneModel.deleteMilestone(milestone.id)
  taskModel.updateTask(task.id, {milestoneId: milestone.id})
  expect((await storage.getTaskWorkflow(task.id)).revision).not.toBe(linked.revision)
})

it("rejects invalid trusted time writes before they can change a task", () => {
  const {taskModel, task, db} = makeWorkflowHarness()
  const before = db.prepare("SELECT spent_time, workflow_time_baseline FROM tasks WHERE id = ?").get(task.id)
  expect(() => taskModel.updateTask(task.id, {spentTime: NaN})).toThrow(expect.objectContaining({code: "invalid_request"}))
  expect(db.prepare("SELECT spent_time, workflow_time_baseline FROM tasks WHERE id = ?").get(task.id)).toEqual(before)
  const invalid = makeTaskInput({spentTime: Infinity})
  expect(() => taskModel.createTask(invalid)).toThrow(expect.objectContaining({code: "invalid_request"}))
  expect(db.prepare("SELECT id FROM tasks WHERE id = ?").get(invalid.id)).toBeUndefined()
})

it("refuses unsafe time addition without corrupting a human total", () => {
  const {taskModel, task, db} = makeWorkflowHarness()
  taskModel.updateTask(task.id, {spentTime: Number.MAX_SAFE_INTEGER})
  expect(() => taskModel.addTaskSpentTime(task.id, 1)).toThrow(expect.objectContaining({code: "invalid_request"}))
  expect(db.prepare("SELECT spent_time FROM tasks WHERE id = ?").get(task.id)).toEqual({spent_time: Number.MAX_SAFE_INTEGER})
})

it("expires a checkpoint when sync changes only the visible tag metadata", async () => {
  const {storage, task, taskModel, tagModel, localAdapter} = makeWorkflowHarness()
  const tag = tagModel.createTag({name: "Original", branchId: "main", color: "red", deletedAt: null})!
  taskModel.addTaskTags(task.id, [tag.id])
  const initial = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "start", expectedRevision: initial.revision, kind: "start", sessionId: "work"},
    {actorId: "a", source: {kind: "mcp"}},
  )
  const docs = await localAdapter.loadAllDocs()
  await localAdapter.upsertDocs({...docs, tags: docs.tags.map((item) => (item.id === tag.id ? {...item, name: "Synced change"} : item))})
  const changed = await storage.getTaskWorkflow(task.id)
  expect(changed.task.tags[0].name).toBe("Synced change")
  expect(changed.activeSessions[0].expired).toBe(true)
})

it("keeps skewed sync tag reversals stale when task content wins LWW and generation unions converge", async () => {
  vi.useFakeTimers({toFake: ["Date"]})
  try {
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"))
    const left = makeWorkflowHarness()
    const right = makeControllerHarness()
    cleanups.push(() => right.db.close())
    const tag = left.tagModel.createTag({name: "Original", color: "red", branchId: "main", deletedAt: null})!
    vi.setSystemTime(new Date("2030-01-01T00:00:01Z"))
    left.taskModel.addTaskTags(left.task.id, [tag.id])
    await right.localAdapter.upsertDocs(await left.localAdapter.loadAllDocs())
    const initial = await left.storage.getTaskWorkflow(left.task.id)
    await left.storage.executeTaskWorkflow(
      {kind: "start", taskId: left.task.id, operationId: "start", sessionId: "work", expectedRevision: initial.revision},
      {actorId: "agent", source: {kind: "mcp"}},
    )
    const before = await left.storage.getTaskWorkflow(left.task.id)
    const {mergeRemoteIntoLocal} = await import("@core/utils/sync/merge/mergeRemoteIntoLocal")
    const {buildSnapshotMeta} = await import("@core/utils/sync/snapshot/buildSnapshot")
    async function pull() {
      const merged = mergeRemoteIntoLocal(await left.localAdapter.loadAllDocs(), await right.localAdapter.loadAllDocs(), "pull", 100000)
      await left.localAdapter.upsertDocs(merged.toUpsert)
    }
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"))
    right.tagModel.updateTag(tag.id, {name: "Changed"})
    await pull()
    expect((await left.storage.getTaskWorkflow(left.task.id)).activeSessions[0].expired).toBe(true)
    right.tagModel.updateTag(tag.id, {name: "Original"})
    await pull()
    const after = await left.storage.getTaskWorkflow(left.task.id)
    expect(after.task.tags[0].name).toBe("Original")
    expect(after.activeSessions[0].expired).toBe(true)
    expect(after.revision).not.toBe(before.revision)
    await expect(
      left.storage.executeTaskWorkflow(
        {kind: "heartbeat", taskId: left.task.id, operationId: "stale", sessionId: "work", expectedRevision: before.revision},
        {actorId: "agent", source: {kind: "mcp"}},
      ),
    ).rejects.toMatchObject({code: "stale_revision"})
    const leftDocs = await left.localAdapter.loadAllDocs()
    const rightDocs = await right.localAdapter.loadAllDocs()
    const forward = mergeRemoteIntoLocal(leftDocs, rightDocs, "pull", 100000)
    const reverse = mergeRemoteIntoLocal(rightDocs, leftDocs, "push", 100000)
    expect(buildSnapshotMeta(forward.resultDocs).hash).toBe(buildSnapshotMeta(reverse.resultDocs).hash)
    await right.localAdapter.upsertDocs(reverse.toUpsert)
    const again = mergeRemoteIntoLocal(await right.localAdapter.loadAllDocs(), leftDocs, "push", 100000)
    expect(again.toUpsert.tasks).toEqual([])
    expect(buildSnapshotMeta(again.resultDocs).hash).toBe(buildSnapshotMeta(forward.resultDocs).hash)
  } finally {
    vi.useRealTimers()
  }
})

it("persists the merged generation when a timestamp tie adopts older task content", async () => {
  vi.useFakeTimers({toFake: ["Date"]})
  try {
    const left = makeWorkflowHarness()
    const right = makeControllerHarness()
    cleanups.push(() => right.db.close())
    await right.localAdapter.upsertDocs(await left.localAdapter.loadAllDocs())
    left.taskModel.updateTask(left.task.id, {content: "Local content"})
    right.taskModel.updateTask(left.task.id, {content: "Remote content"})
    const {mergeRemoteIntoLocal} = await import("@core/utils/sync/merge/mergeRemoteIntoLocal")
    const remote = await right.localAdapter.loadAllDocs()
    const initial = mergeRemoteIntoLocal(await left.localAdapter.loadAllDocs(), remote, "push", 100000)
    await left.localAdapter.upsertDocs(initial.toUpsert)
    const union = (await left.localAdapter.loadAllDocs()).tasks[0].workflow_generation
    const replay = mergeRemoteIntoLocal(await left.localAdapter.loadAllDocs(), remote, "pull", 100000)
    await left.localAdapter.upsertDocs(replay.toUpsert)
    const persisted = await left.localAdapter.loadAllDocs()
    expect(persisted.tasks).toEqual(replay.resultDocs.tasks)
    expect(persisted.tasks[0]).toMatchObject({content: "Remote content", workflow_generation: union})
    const revision = (await left.storage.getTaskWorkflow(left.task.id)).revision
    const repeated = mergeRemoteIntoLocal(persisted, remote, "pull", 100000)
    await left.localAdapter.upsertDocs(repeated.toUpsert)
    expect((await left.storage.getTaskWorkflow(left.task.id)).revision).toBe(revision)
  } finally {
    vi.useRealTimers()
  }
})
