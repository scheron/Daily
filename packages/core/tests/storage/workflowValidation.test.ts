import {afterEach, expect, it, vi} from "vitest"

import {WorkflowRecordModel} from "@core/storage/models/WorkflowRecordModel"
import {WorkStorage} from "@core/storage/WorkStorage"
import {mergeRemoteIntoLocal} from "@core/utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshot} from "@core/utils/sync/snapshot/buildSnapshot"
import {isValidSnapshot} from "@core/utils/sync/snapshot/isValidSnapshot"
import {normalizeSnapshotDocs} from "@core/utils/sync/snapshot/normalizeSnapshotDocs"
import {canonicalWorkflowValue} from "@core/utils/task-workflow/canonicalWorkflowValue"
import {validateWorkflowSnapshotDocs} from "@core/utils/task-workflow/validateWorkflowSnapshotDocs"
import {workflowDigest} from "@core/utils/task-workflow/workflowDigest"
import {workflowSpentTime} from "@core/utils/task-workflow/workflowSpentTime"
import {makeControllerHarness, makeTaskInput} from "../helpers/storageControllerHarness"

import type {AgentSessionState, Snapshot, SnapshotDocs, SyncStrategy, TaskWorkflowCommand, TaskWorkflowRecord} from "@daily/protocol"

const cleanups: Array<() => void> = []
afterEach(() => {
  vi.useRealTimers()
  for (const cleanup of cleanups.splice(0)) cleanup()
})

async function makeHarness() {
  const core = makeControllerHarness()
  cleanups.push(() => core.db.close())
  const storage = new WorkStorage(core, core.db, () => {}, {runtimeId: "validation-runtime", now: () => 0})
  const task = core.taskModel.createTask(makeTaskInput())!
  const state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {kind: "start", taskId: task.id, operationId: "valid-start", sessionId: "session", expectedRevision: state.revision},
    {actorId: "agent", source: {kind: "mcp"}},
  )
  const docs = await core.localAdapter.loadAllDocs()
  return {...core, storage, task, docs, record: docs.workflowRecords![0]}
}

it("rejects malformed workflow import before any writes and preserves the complete database", async () => {
  const {localAdapter, docs, record} = await makeHarness()
  const malformed = {...record, id: "new-poison", command: null} as unknown as TaskWorkflowRecord
  const poisoned = {...docs, branches: docs.branches.map((branch) => ({...branch, name: "Must not write"})), workflowRecords: [malformed]}
  await expect(localAdapter.upsertDocs(poisoned)).rejects.toMatchObject({code: "invalid_request"})
  expect(await localAdapter.loadAllDocs()).toEqual(docs)
  expect(() => mergeRemoteIntoLocal(docs, poisoned, "pull", 100000)).toThrow(expect.objectContaining({code: "invalid_request"}))
  expect(() => isValidSnapshot(buildSnapshot(poisoned))).toThrow(/workflow/i)
})

it("rejects invalid immutable identity, canonical requests, receipts and interval bounds at append and projection", async () => {
  const {db, record} = await makeHarness()
  const corruptions = [
    {...record, id: "forged"},
    {...record, taskId: "other-task"},
    {...record, actorId: ""},
    {...record, canonicalRequest: "{}"},
    {...record, sequence: -1},
    {...record, createdAt: Infinity},
    {...record, receipt: {...record.receipt, recordId: "other"}},
    {...record, receipt: {...record.receipt, revision: ""}},
    {...record, receipt: {...record.receipt, confirmedSeconds: NaN}},
    {...record, interval: {from: 0, to: 1e308}},
    {...record, interval: {from: 0, to: "bad"}},
    {...record, interval: {from: 0, to: 1}},
    {...record, command: {...record.command, extra: "untrusted"}},
  ]
  for (const corrupted of corruptions) {
    expect(() => new WorkflowRecordModel(db).append(corrupted as TaskWorkflowRecord)).toThrow(expect.objectContaining({code: "invalid_request"}))
    expect(() => workflowSpentTime(0, 0, [corrupted as TaskWorkflowRecord], record.taskId)).toThrow(
      expect.objectContaining({code: "invalid_request"}),
    )
  }
  expect(new WorkflowRecordModel(db).getAll()).toEqual([record])
})

it("rejects nonfinite or negative trusted task time metadata without poisoning human corrections", async () => {
  const {localAdapter, docs, storage, task} = await makeHarness()
  for (const metadata of [
    {spent_time: NaN},
    {spent_time: -1},
    {workflow_time_baseline: Infinity},
    {workflow_time_baseline: -1},
    {workflow_time_baseline: null},
    {workflow_generation: 42},
  ]) {
    await expect(
      localAdapter.upsertDocs({...docs, tasks: docs.tasks.map((row) => ({...row, ...metadata})) as typeof docs.tasks}),
    ).rejects.toMatchObject({
      code: "invalid_request",
    })
    expect(await localAdapter.loadAllDocs()).toEqual(docs)
  }
  expect(() => workflowSpentTime(NaN, 0, [], task.id)).toThrow(expect.objectContaining({code: "invalid_request"}))
  await expect(storage.updateTask(task.id, {spentTime: 7})).resolves.toMatchObject({tasks: {upserted: [{spentTime: 7}]}})
})

it("preserves legacy immutable history while requiring the current snapshot metadata", async () => {
  const {docs, record, localAdapter} = await makeHarness()
  const {checkpointMonotonic: _checkpointMonotonic, proposalCommentId: _proposalCommentId, ...legacyRecord} = record
  const legacyDocs = {...docs, workflowRecords: [legacyRecord]} as typeof docs
  const legacySnapshot = {...buildSnapshot(docs), version: 17, docs: legacyDocs}
  expect(isValidSnapshot(legacySnapshot as never)).toBe(true)
  const migrated = normalizeSnapshotDocs(legacyDocs, 17)
  expect(migrated.workflowRecords).toEqual([{...legacyRecord, checkpointMonotonic: null, proposalCommentId: null}])
  expect(() => isValidSnapshot({...legacySnapshot, version: 18} as never)).toThrow(expect.objectContaining({code: "invalid_request"}))
  const fresh = makeControllerHarness()
  cleanups.push(() => fresh.db.close())
  await fresh.localAdapter.upsertDocs(migrated)
  expect((await fresh.localAdapter.loadAllDocs()).workflowRecords).toEqual(migrated.workflowRecords)
  expect((await localAdapter.loadAllDocs()).workflowRecords).toEqual([record])
})

it("reports poisoned remote history as an actionable sync failure without pushing or writing data", async () => {
  const {SyncEngine} = await import("@core/storage/sync/SyncEngine")
  const {docs, record, localAdapter} = await makeHarness()
  let pushes = 0
  const engine = new SyncEngine(
    localAdapter,
    [
      {
        id: "test",
        label: "Test remote",
        adapter: {
          async loadSnapshot() {
            return {...buildSnapshot(docs), docs: {...docs, workflowRecords: [{...record, command: null} as unknown as TaskWorkflowRecord]}}
          },
          async saveSnapshot() {
            pushes++
          },
          async syncAssets() {},
        },
      },
    ],
    {assetsDir: () => "unused", onStatusChange() {}, onDataChanged() {}},
  )
  await expect(engine.syncOnce()).rejects.toMatchObject({code: "invalid_request"})
  expect(engine.syncStatus).toBe("error")
  expect(engine.getRemoteStates()[0].lastError).toMatch(/workflow.*repair/i)
  expect(pushes).toBe(0)
  expect(await localAdapter.loadAllDocs()).toEqual(docs)
})

async function makeConcurrentTimeSnapshots() {
  const left = makeControllerHarness()
  const right = makeControllerHarness()
  cleanups.push(
    () => left.db.close(),
    () => right.db.close(),
  )
  let wall = 0
  let monotonic = 0
  const leftStorage = new WorkStorage(left, left.db, () => {})
  const rightStorage = new WorkStorage(right, right.db, () => {}, {runtimeId: "right", now: () => wall, monotonicNow: () => monotonic})
  const task = left.taskModel.createTask(makeTaskInput())!
  await right.localAdapter.upsertDocs(await left.localAdapter.loadAllDocs())
  let state = await rightStorage.getTaskWorkflow(task.id)
  await rightStorage.executeTaskWorkflow(
    {kind: "start", taskId: task.id, operationId: "start", sessionId: "work", expectedRevision: state.revision},
    {actorId: "agent", source: {kind: "mcp"}},
  )
  wall = monotonic = 1000
  state = await rightStorage.getTaskWorkflow(task.id)
  await rightStorage.executeTaskWorkflow(
    {kind: "pause", taskId: task.id, operationId: "pause", sessionId: "work", expectedRevision: state.revision},
    {actorId: "agent", source: {kind: "mcp"}},
  )
  await leftStorage.updateTask(task.id, {spentTime: Number.MAX_SAFE_INTEGER})
  return {
    left,
    right,
    leftStorage,
    rightStorage,
    task,
    leftDocs: await left.localAdapter.loadAllDocs(),
    rightDocs: await right.localAdapter.loadAllDocs(),
  }
}

it("rejects unsafe effective totals assembled from valid human and workflow snapshots before import or publication", async () => {
  const {left, leftStorage, task, leftDocs, rightDocs} = await makeConcurrentTimeSnapshots()
  const combined = {...leftDocs, workflowRecords: rightDocs.workflowRecords}
  await expect(left.localAdapter.upsertDocs(combined)).rejects.toMatchObject({code: "invalid_request"})
  expect(await left.localAdapter.loadAllDocs()).toEqual(leftDocs)
  expect(() => normalizeSnapshotDocs(combined)).toThrow(expect.objectContaining({code: "invalid_request"}))
  expect(() => buildSnapshot(combined)).toThrow(expect.objectContaining({code: "invalid_request"}))
  expect(() => mergeRemoteIntoLocal(leftDocs, rightDocs, "push", 100000)).toThrow(expect.objectContaining({code: "invalid_request"}))
  await expect(leftStorage.updateTask(task.id, {spentTime: 7})).resolves.toMatchObject({tasks: {upserted: [{spentTime: 7}]}})
})

it("rejects a record-only import that overflows the existing human total without writing another collection", async () => {
  const {left, leftDocs, rightDocs} = await makeConcurrentTimeSnapshots()
  const incoming = {...rightDocs, tasks: [], branches: rightDocs.branches.map((branch) => ({...branch, name: "Must not write"}))}
  await expect(left.localAdapter.upsertDocs(incoming)).rejects.toMatchObject({code: "invalid_request"})
  expect(await left.localAdapter.loadAllDocs()).toEqual(leftDocs)
})

it("rejects a task-only import that overflows existing workflow history and retains human correction", async () => {
  const {right, rightStorage, task, leftDocs, rightDocs} = await makeConcurrentTimeSnapshots()
  await expect(right.localAdapter.upsertDocs({...leftDocs, workflowRecords: []})).rejects.toMatchObject({code: "invalid_request"})
  expect(await right.localAdapter.loadAllDocs()).toEqual(rightDocs)
  await expect(rightStorage.updateTask(task.id, {spentTime: 7})).resolves.toMatchObject({tasks: {upserted: [{spentTime: 7}]}})
  expect((await rightStorage.getTaskWorkflow(task.id)).confirmedSeconds).toBe(1)
})

it("rejects a complete correction baseline larger than retained confirmed work before any import writes", async () => {
  const {docs, localAdapter} = await makeHarness()
  const snapshot = buildSnapshot(docs)
  snapshot.docs.tasks[0].workflow_time_baseline = 100
  expect(() => isValidSnapshot(snapshot)).toThrow(expect.objectContaining({code: "invalid_request"}))
  await expect(localAdapter.upsertDocs(snapshot.docs)).rejects.toMatchObject({code: "invalid_request"})
  expect(await localAdapter.loadAllDocs()).toEqual(docs)
  expect(() => mergeRemoteIntoLocal(docs, snapshot.docs, "pull", 100000)).toThrow(expect.objectContaining({code: "invalid_request"}))
})

it("rejects a task-only correction exceeding combined retained history and preserves valid partial corrections", async () => {
  const {right, rightStorage, task, rightDocs} = await makeConcurrentTimeSnapshots()
  const delta = {...rightDocs, workflowRecords: [], tasks: rightDocs.tasks.map((row) => ({...row, spent_time: 7, workflow_time_baseline: 2}))}
  await expect(right.localAdapter.upsertDocs(delta)).rejects.toMatchObject({code: "invalid_request"})
  expect(await right.localAdapter.loadAllDocs()).toEqual(rightDocs)
  delta.tasks[0].workflow_time_baseline = 1
  await right.localAdapter.upsertDocs(delta)
  expect((await rightStorage.getTask(task.id))?.spentTime).toBe(7)
  expect((await rightStorage.getTaskWorkflow(task.id)).confirmedSeconds).toBe(1)
})

it("requires a retained session start for complete history but accepts a terminal delta against its retained start", async () => {
  const core = makeControllerHarness()
  cleanups.push(() => core.db.close())
  let observed = 0
  const storage = new WorkStorage(core, core.db, () => {}, {runtimeId: "history", now: () => observed, monotonicNow: () => observed})
  const task = core.taskModel.createTask(makeTaskInput())!
  let state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "history-start", expectedRevision: state.revision, kind: "session_start", sessionId: "history"},
    {actorId: "agent", source: {kind: "mcp"}},
  )
  const initial = await core.localAdapter.loadAllDocs()
  observed = 10000
  state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {
      taskId: task.id,
      operationId: "history-finish",
      expectedRevision: state.revision,
      kind: "session_update",
      sessionId: "history",
      state: "finished",
    },
    {actorId: "agent", source: {kind: "mcp"}},
  )
  const full = await core.localAdapter.loadAllDocs()
  const terminal = full.workflowRecords!.filter((record) => record.command.kind === "session_update")
  const snapshot = buildSnapshot(full)
  snapshot.docs.workflowRecords = terminal
  expect(() => isValidSnapshot(snapshot)).toThrow(expect.objectContaining({code: "invalid_request"}))
  const target = makeControllerHarness()
  cleanups.push(() => target.db.close())
  await target.localAdapter.upsertDocs(initial)
  await target.localAdapter.upsertDocs({...full, tasks: [], workflowRecords: terminal})
  const targetStorage = new WorkStorage(target, target.db, () => {})
  expect((await targetStorage.getTask(task.id))?.spentTime).toBe(10)
  expect((await targetStorage.getTaskWorkflow(task.id)).sessions).toMatchObject([{state: "finished", startedAt: 0}])
})

async function makeTerminalContinuation() {
  const core = makeControllerHarness()
  cleanups.push(() => core.db.close())
  let observed = 0
  const storage = new WorkStorage(core, core.db, () => {}, {runtimeId: "terminal", now: () => observed, monotonicNow: () => observed})
  const task = core.taskModel.createTask(makeTaskInput())!
  let state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "terminal-start", expectedRevision: state.revision, kind: "session_start", sessionId: "terminal"},
    {actorId: "agent", source: {kind: "mcp"}},
  )
  observed = 10000
  state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {
      taskId: task.id,
      operationId: "terminal-finish",
      expectedRevision: state.revision,
      kind: "session_update",
      sessionId: "terminal",
      state: "finished",
    },
    {actorId: "agent", source: {kind: "mcp"}},
  )
  const docs = await core.localAdapter.loadAllDocs()
  const terminal = docs.workflowRecords!.find((record) => record.command.kind === "session_update")!
  const continuation = structuredClone(terminal)
  if (continuation.command.kind !== "session_update") throw new Error("Expected a terminal session update")
  continuation.command.operationId = "after-terminal"
  continuation.command.expectedRevision = terminal.receipt.revision
  observed = 20000
  expect((await storage.getTaskWorkflow(task.id)).revision).toBe(terminal.receipt.revision)
  await expect(storage.executeTaskWorkflow(continuation.command, {actorId: "agent", source: {kind: "mcp"}})).rejects.toMatchObject({
    code: "conflict",
  })
  continuation.id = workflowDigest({actorId: continuation.actorId, operationId: continuation.command.operationId})
  continuation.canonicalRequest = canonicalWorkflowValue({command: continuation.command, actorId: continuation.actorId, source: continuation.source})
  continuation.sequence++
  continuation.createdAt = continuation.checkpointMonotonic = observed
  continuation.interval = {from: 0, to: observed}
  continuation.receipt = {...continuation.receipt, operationId: continuation.command.operationId, recordId: continuation.id, confirmedSeconds: 20}
  return {...core, storage, task, docs, continuation}
}

function asLegacySessionRecord(record: TaskWorkflowRecord, kind: "start" | "heartbeat" | "pause"): TaskWorkflowRecord {
  const {
    schema: _schema,
    originalValues: _originalValues,
    effectiveChanges: _effectiveChanges,
    sessionId: _sessionId,
    sessionState: _sessionState,
    receipt,
    ...rest
  } = record
  const {outcome: _outcome, proposalId: _proposalId, ...legacyReceipt} = receipt
  if (!("sessionId" in record.command)) throw new Error("Expected a session command")
  const command = {
    kind,
    taskId: record.taskId,
    operationId: `legacy-${record.command.operationId}`,
    expectedRevision: record.command.expectedRevision,
    sessionId: record.command.sessionId,
  }
  const id = workflowDigest({actorId: record.actorId, operationId: command.operationId})
  return {
    ...rest,
    id,
    command,
    checkpointMonotonic: null,
    canonicalRequest: canonicalWorkflowValue({command, actorId: record.actorId, source: record.source}),
    receipt: {...legacyReceipt, kind, operationId: command.operationId, recordId: id, revision: workflowDigest({legacyRecord: id})},
  }
}

it.each<[Extract<TaskWorkflowCommand["kind"], "heartbeat" | "pause">, boolean]>([
  ["heartbeat", false],
  ["pause", false],
  ["heartbeat", true],
  ["pause", true],
])("rejects legacy %s after a current terminal receipt with indirect ancestry=%s on full, merged and delta imports", async (kind, indirect) => {
  const core = await makeTerminalContinuation()
  if (indirect) {
    const receipt = await core.storage.executeTaskWorkflow(
      {
        taskId: core.task.id,
        operationId: "intervening-session",
        expectedRevision: core.continuation.command.expectedRevision,
        kind: "session_start",
        sessionId: "other-session",
      },
      {actorId: "other-agent", source: {kind: "mcp"}},
    )
    core.continuation.command.expectedRevision = receipt.revision
  }
  const retained = await core.localAdapter.loadAllDocs()
  const legacy = asLegacySessionRecord(core.continuation, kind)
  const frozen = await core.storage.getTaskWorkflow(core.task.id)
  legacy.receipt.revision = workflowDigest({
    task: {...frozen.task, spentTime: 20},
    generation: retained.tasks[0].workflow_generation,
    ids: [...frozen.records.map((record) => record.id), legacy.id].sort(),
    guidance: [frozen.guidance.workspace.revision, frozen.guidance.project?.revision ?? null],
  })
  expect(legacy.receipt.revision).not.toBe(core.continuation.command.expectedRevision)
  await expect(
    core.storage.executeTaskWorkflow(legacy.command as TaskWorkflowCommand, {actorId: "agent", source: {kind: "mcp"}}),
  ).rejects.toMatchObject({
    code: "conflict",
  })
  const full = {...retained, workflowRecords: [...retained.workflowRecords!, legacy]}
  const delta = {
    ...retained,
    tasks: [],
    branches: retained.branches.map((branch) => ({...branch, name: "Must not write"})),
    workflowRecords: [legacy],
  }
  expect(() => validateWorkflowSnapshotDocs(delta)).not.toThrow()
  expect(() => validateWorkflowSnapshotDocs(full, {completeHistory: true})).toThrow(/terminal boundary/)
  expect(() => buildSnapshot(full)).toThrow(/terminal boundary/)
  expect(() => isValidSnapshot({...buildSnapshot(retained), docs: full})).toThrow(/terminal boundary/)
  const strategies: SyncStrategy[] = ["pull", "push"]
  for (const strategy of strategies) {
    expect(() => mergeRemoteIntoLocal(retained, full, strategy, 100000)).toThrow(/terminal boundary/)
    expect(() => mergeRemoteIntoLocal(full, retained, strategy, 100000)).toThrow(/terminal boundary/)
    expect(() => mergeRemoteIntoLocal(retained, delta, strategy, 100000)).toThrow(/terminal boundary/)
  }
  const target = makeControllerHarness()
  cleanups.push(() => target.db.close())
  const before = await target.localAdapter.loadAllDocs()
  await expect(target.localAdapter.upsertDocs(full)).rejects.toThrow(/terminal boundary/)
  expect(await target.localAdapter.loadAllDocs()).toEqual(before)
  await expect(core.localAdapter.upsertDocs(delta)).rejects.toThrow(/terminal boundary/)
  expect(await core.localAdapter.loadAllDocs()).toEqual(retained)
  expect((await core.storage.getTaskWorkflow(core.task.id)).confirmedSeconds).toBe(10)
  expect((await core.storage.getTask(core.task.id))?.spentTime).toBe(10)
})

it.each(["other-session", "other-actor", "preterminal-fork"])("preserves a legacy %s alongside current terminal history", async (control) => {
  const core = await makeTerminalContinuation()
  if (!("sessionId" in core.continuation.command)) throw new Error("Expected a session command")
  if (control === "other-session") core.continuation.command.sessionId = "other-session"
  if (control === "other-actor") core.continuation.actorId = "other-agent"
  if (control === "preterminal-fork")
    core.continuation.command.expectedRevision = core.docs.workflowRecords!.find(
      (record) => record.command.kind === "session_start",
    )!.receipt.revision
  const legacy = asLegacySessionRecord(core.continuation, "heartbeat")
  await expectLegacyHistoryAccepted(core.docs, [legacy], core.task.id)
})

it("preserves real v17 start, heartbeat and pause aliases with unknown checkpoint metadata", async () => {
  const core = await makeTerminalContinuation()
  const start = asLegacySessionRecord(core.docs.workflowRecords!.find((record) => record.command.kind === "session_start")!, "start")
  const heartbeat = asLegacySessionRecord(core.docs.workflowRecords!.find((record) => record.command.kind === "session_update")!, "heartbeat")
  heartbeat.command.expectedRevision = start.receipt.revision
  heartbeat.canonicalRequest = canonicalWorkflowValue({command: heartbeat.command, actorId: heartbeat.actorId, source: heartbeat.source})
  const pause = asLegacySessionRecord(core.continuation, "pause")
  pause.command.expectedRevision = heartbeat.receipt.revision
  pause.canonicalRequest = canonicalWorkflowValue({command: pause.command, actorId: pause.actorId, source: pause.source})
  const legacyDocs = {
    ...core.docs,
    workflowRecords: [start, heartbeat, pause].map(
      ({checkpointMonotonic: _checkpointMonotonic, proposalCommentId: _proposalCommentId, ...record}) => record,
    ),
  } as SnapshotDocs
  expect(isValidSnapshot({...buildSnapshot(core.docs), version: 17, docs: legacyDocs} as never)).toBe(true)
  const normalized = normalizeSnapshotDocs(legacyDocs, 17)
  expect(normalized.workflowRecords!.every((record) => record.checkpointMonotonic === null)).toBe(true)
  await expectLegacyHistoryAccepted({...normalized, workflowRecords: [start]}, [heartbeat, pause], core.task.id)
})

async function expectLegacyHistoryAccepted(retained: SnapshotDocs, incoming: TaskWorkflowRecord[], taskId: string) {
  const full = {...retained, workflowRecords: [...retained.workflowRecords!, ...incoming]}
  const delta = {...full, tasks: [], workflowRecords: incoming}
  expect(isValidSnapshot(buildSnapshot(full))).toBe(true)
  const strategies: SyncStrategy[] = ["pull", "push"]
  for (const strategy of strategies) {
    for (const [local, remote] of [
      [retained, full],
      [full, retained],
      [retained, delta],
    ])
      expect(isValidSnapshot(buildSnapshot(mergeRemoteIntoLocal(local, remote, strategy, 100000).resultDocs))).toBe(true)
  }
  const fullTarget = makeControllerHarness()
  const deltaTarget = makeControllerHarness()
  cleanups.push(
    () => fullTarget.db.close(),
    () => deltaTarget.db.close(),
  )
  await fullTarget.localAdapter.upsertDocs(full)
  await deltaTarget.localAdapter.upsertDocs(retained)
  await deltaTarget.localAdapter.upsertDocs(delta)
  for (const target of [fullTarget, deltaTarget]) {
    const storage = new WorkStorage(target, target.db, () => {})
    expect((await storage.getTaskWorkflow(taskId)).confirmedSeconds).toBe(20)
    expect((await storage.getTask(taskId))?.spentTime).toBe(20)
  }
}

it("rejects a complete import that continues a session from its authentic terminal revision before any writes", async () => {
  const {docs, continuation, task} = await makeTerminalContinuation()
  const poisoned = {...docs, workflowRecords: [...docs.workflowRecords!, continuation]}
  const target = makeControllerHarness()
  cleanups.push(() => target.db.close())
  const before = await target.localAdapter.loadAllDocs()
  await expect(target.localAdapter.upsertDocs(poisoned)).rejects.toMatchObject({code: "invalid_request"})
  expect(await target.localAdapter.loadAllDocs()).toEqual(before)
  const targetStorage = new WorkStorage(target, target.db, () => {})
  expect(await targetStorage.getTask(task.id)).toBeNull()
  expect(() => isValidSnapshot({...buildSnapshot(docs), docs: poisoned})).toThrow(expect.objectContaining({code: "invalid_request"}))
  expect(() => buildSnapshot(poisoned)).toThrow(expect.objectContaining({code: "invalid_request"}))
  expect(() => mergeRemoteIntoLocal(docs, poisoned, "pull", 100000)).toThrow(expect.objectContaining({code: "invalid_request"}))
})

it("rejects a record-only continuation against a retained terminal revision and rolls back every imported collection", async () => {
  const {docs, continuation, localAdapter, storage, task} = await makeTerminalContinuation()
  const delta = {
    ...docs,
    tasks: [],
    branches: docs.branches.map((branch) => ({...branch, name: "Must not write"})),
    workflowRecords: [continuation],
  }
  await expect(localAdapter.upsertDocs(delta)).rejects.toMatchObject({code: "invalid_request"})
  expect(await localAdapter.loadAllDocs()).toEqual(docs)
  expect((await storage.getTask(task.id))?.spentTime).toBe(10)
})

it("rejects a continuation causally following its terminal session through another actor's retained revision", async () => {
  const {storage, task, docs, continuation, localAdapter} = await makeTerminalContinuation()
  const receipt = await storage.executeTaskWorkflow(
    {
      taskId: task.id,
      operationId: "other-session-start",
      expectedRevision: continuation.command.expectedRevision,
      kind: "session_start",
      sessionId: "other-session",
    },
    {actorId: "other-agent", source: {kind: "mcp"}},
  )
  const retained = await localAdapter.loadAllDocs()
  continuation.command.expectedRevision = receipt.revision
  continuation.canonicalRequest = canonicalWorkflowValue({command: continuation.command, actorId: continuation.actorId, source: continuation.source})
  continuation.sequence = retained.workflowRecords!.length
  const delta = {...docs, tasks: [], workflowRecords: [continuation]}
  await expect(localAdapter.upsertDocs(delta)).rejects.toMatchObject({code: "invalid_request"})
  expect(await localAdapter.loadAllDocs()).toEqual(retained)
  expect((await storage.getTask(task.id))?.spentTime).toBe(10)
})

it("preserves an offline same-session fork beyond a terminal boundary when its causal revisions precede that boundary", async () => {
  const left = makeControllerHarness()
  const right = makeControllerHarness()
  cleanups.push(
    () => left.db.close(),
    () => right.db.close(),
  )
  let observed = 0
  const leftStorage = new WorkStorage(left, left.db, () => {}, {runtimeId: "fork-left", now: () => observed, monotonicNow: () => observed})
  const rightStorage = new WorkStorage(right, right.db, () => {}, {runtimeId: "fork-right", now: () => observed, monotonicNow: () => observed})
  const task = left.taskModel.createTask(makeTaskInput())!
  const initial = await leftStorage.getTaskWorkflow(task.id)
  await leftStorage.executeTaskWorkflow(
    {taskId: task.id, operationId: "fork-start", expectedRevision: initial.revision, kind: "session_start", sessionId: "fork"},
    {actorId: "agent", source: {kind: "mcp"}},
  )
  await right.localAdapter.upsertDocs(await left.localAdapter.loadAllDocs())
  const boundaries: [WorkStorage, number, string, AgentSessionState][] = [
    [rightStorage, 5000, "fork-resume", "working"],
    [leftStorage, 10000, "fork-left-finish", "finished"],
    [rightStorage, 20000, "fork-right-finish", "finished"],
  ]
  for (const [storage, at, operationId, state] of boundaries) {
    observed = at
    const current = await storage.getTaskWorkflow(task.id)
    await storage.executeTaskWorkflow(
      {taskId: task.id, operationId, expectedRevision: current.revision, kind: "session_update", sessionId: "fork", state},
      {actorId: "agent", source: {kind: "mcp"}},
    )
  }
  const leftDocs = await left.localAdapter.loadAllDocs()
  const rightDocs = await right.localAdapter.loadAllDocs()
  const forward = mergeRemoteIntoLocal(leftDocs, rightDocs, "pull", 100000)
  const backward = mergeRemoteIntoLocal(rightDocs, leftDocs, "push", 100000)
  expect(isValidSnapshot(buildSnapshot(forward.resultDocs))).toBe(true)
  expect(isValidSnapshot(buildSnapshot(backward.resultDocs))).toBe(true)
  await left.localAdapter.upsertDocs({...rightDocs, tasks: [], workflowRecords: rightDocs.workflowRecords!.filter((record) => record.sequence > 0)})
  await right.localAdapter.upsertDocs({...leftDocs, tasks: [], workflowRecords: leftDocs.workflowRecords!.filter((record) => record.sequence > 0)})
  expect((await leftStorage.getTaskWorkflow(task.id)).confirmedSeconds).toBe(20)
  expect((await rightStorage.getTaskWorkflow(task.id)).confirmedSeconds).toBe(20)
  expect((await leftStorage.getTask(task.id))?.spentTime).toBe(20)
  expect((await rightStorage.getTask(task.id))?.spentTime).toBe(20)
})

it("rejects complete receipts claiming time absent from all retained intervals", async () => {
  const {docs} = await makeHarness()
  const snapshot = buildSnapshot(docs)
  snapshot.docs.workflowRecords![0].receipt.confirmedSeconds = 1
  expect(() => isValidSnapshot(snapshot)).toThrow(expect.objectContaining({code: "invalid_request"}))
})

it("credits only the additional union learned offline after a human correction of known work", async () => {
  const left = makeControllerHarness()
  const right = makeControllerHarness()
  cleanups.push(
    () => left.db.close(),
    () => right.db.close(),
  )
  let observed = 0
  const leftStorage = new WorkStorage(left, left.db, () => {}, {runtimeId: "left", now: () => observed, monotonicNow: () => observed})
  const rightStorage = new WorkStorage(right, right.db, () => {}, {runtimeId: "right", now: () => observed, monotonicNow: () => observed})
  const task = left.taskModel.createTask(makeTaskInput())!
  await right.localAdapter.upsertDocs(await left.localAdapter.loadAllDocs())
  const actors: [WorkStorage, string][] = [
    [leftStorage, "left"],
    [rightStorage, "right"],
  ]
  for (const [storage, actor] of actors) {
    const state = await storage.getTaskWorkflow(task.id)
    await storage.executeTaskWorkflow(
      {taskId: task.id, operationId: `${actor}-start`, expectedRevision: state.revision, kind: "session_start", sessionId: actor},
      {actorId: actor, source: {kind: "mcp"}},
    )
  }
  observed = 10000
  let state = await leftStorage.getTaskWorkflow(task.id)
  await leftStorage.executeTaskWorkflow(
    {taskId: task.id, operationId: "left-finish", expectedRevision: state.revision, kind: "session_update", sessionId: "left", state: "finished"},
    {actorId: "left", source: {kind: "mcp"}},
  )
  observed = 20000
  state = await rightStorage.getTaskWorkflow(task.id)
  await rightStorage.executeTaskWorkflow(
    {taskId: task.id, operationId: "right-finish", expectedRevision: state.revision, kind: "session_update", sessionId: "right", state: "finished"},
    {actorId: "right", source: {kind: "mcp"}},
  )
  observed = 30000
  await leftStorage.updateTask(task.id, {spentTime: 0})
  const corrected = await left.localAdapter.loadAllDocs()
  expect(corrected.tasks[0].workflow_time_baseline).toBe(10)
  const remote = await right.localAdapter.loadAllDocs()
  const forward = mergeRemoteIntoLocal(corrected, remote, "pull", 100000)
  const backward = mergeRemoteIntoLocal(remote, corrected, "push", 100000)
  await left.localAdapter.upsertDocs(forward.toUpsert)
  await right.localAdapter.upsertDocs(backward.toUpsert)
  expect((await leftStorage.getTaskWorkflow(task.id)).confirmedSeconds).toBe(20)
  expect((await leftStorage.getTask(task.id))?.spentTime).toBe(10)
  expect((await rightStorage.getTask(task.id))?.spentTime).toBe(10)
  expect(isValidSnapshot(buildSnapshot(await left.localAdapter.loadAllDocs()))).toBe(true)
})

it("requires the retained working checkpoint that backs each confirmed interval", async () => {
  const core = makeControllerHarness()
  cleanups.push(() => core.db.close())
  let observed = 0
  const storage = new WorkStorage(core, core.db, () => {}, {runtimeId: "chain", now: () => observed, monotonicNow: () => observed})
  const task = core.taskModel.createTask(makeTaskInput())!
  const commands: [
    number,
    (
      | Omit<Extract<TaskWorkflowCommand, {kind: "session_start"}>, "taskId" | "operationId" | "expectedRevision">
      | Omit<Extract<TaskWorkflowCommand, {kind: "session_update"}>, "taskId" | "operationId" | "expectedRevision">
    ),
  ][] = [
    [0, {kind: "session_start", sessionId: "chain"}],
    [10000, {kind: "session_update", sessionId: "chain", state: "waiting"}],
    [20000, {kind: "session_update", sessionId: "chain", state: "working"}],
    [30000, {kind: "session_update", sessionId: "chain", state: "finished"}],
  ]
  for (const [at, command] of commands) {
    observed = at
    const state = await storage.getTaskWorkflow(task.id)
    await storage.executeTaskWorkflow(
      {taskId: task.id, operationId: `chain-${at}`, expectedRevision: state.revision, ...command},
      {actorId: "agent", source: {kind: "mcp"}},
    )
  }
  const snapshot = buildSnapshot(await core.localAdapter.loadAllDocs())
  snapshot.docs.workflowRecords = snapshot.docs.workflowRecords!.filter((record) => record.createdAt !== 20000)
  expect(() => isValidSnapshot(snapshot)).toThrow(expect.objectContaining({code: "invalid_request"}))
})

it("requires a retained proposal for every complete human decision history", async () => {
  const {docs, storage, task} = await makeHarness()
  let state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "review", expectedRevision: state.revision, kind: "propose", changes: {priority: "high"}, reason: "Review"},
    {actorId: "agent", source: {kind: "mcp"}},
  )
  state = await storage.getTaskWorkflow(task.id)
  await storage.resolveTaskWorkflowProposal({
    taskId: task.id,
    proposalId: state.proposals[0].id,
    operationId: "decision",
    expectedRevision: state.revision,
    decision: "rejected",
  })
  const complete = await storage.getTaskWorkflow(task.id)
  const snapshot = buildSnapshot({...docs, workflowRecords: complete.records})
  snapshot.docs.workflowRecords = complete.records.filter((record) => record.command.kind !== "propose")
  expect(() => isValidSnapshot(snapshot)).toThrow(expect.objectContaining({code: "invalid_request"}))
})

it("converges final combined task values after independent offline acceptance and rejection", async () => {
  vi.useFakeTimers({toFake: ["Date"]})
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"))
  const {storage, task, localAdapter, docs} = await makeHarness()
  let state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {
      taskId: task.id,
      operationId: "offline-proposal",
      expectedRevision: state.revision,
      kind: "propose",
      changes: {scheduled: null},
      reason: "Defer to backlog",
    },
    {actorId: "agent", source: {kind: "mcp"}},
  )
  const right = makeControllerHarness()
  cleanups.push(() => right.db.close())
  const rightStorage = new WorkStorage(right, right.db, () => {}, {runtimeId: "offline-right", now: () => 0, monotonicNow: () => 0})
  await right.localAdapter.upsertDocs(await localAdapter.loadAllDocs())
  state = await storage.getTaskWorkflow(task.id)
  const originalRight = await right.localAdapter.loadAllDocs()
  vi.setSystemTime(new Date("2030-01-02T00:00:00Z"))
  await storage.resolveTaskWorkflowProposal({
    taskId: task.id,
    proposalId: state.proposals[0].id,
    operationId: "offline-accept",
    expectedRevision: state.revision,
    decision: "accepted",
  })
  const rightState = await rightStorage.getTaskWorkflow(task.id)
  await rightStorage.resolveTaskWorkflowProposal({
    taskId: task.id,
    proposalId: rightState.proposals[0].id,
    operationId: "offline-reject",
    expectedRevision: rightState.revision,
    decision: "rejected",
  })
  expect((await right.localAdapter.loadAllDocs()).tasks).toEqual(originalRight.tasks)
  const leftDocs = await localAdapter.loadAllDocs()
  const rightDocs = await right.localAdapter.loadAllDocs()
  const forward = mergeRemoteIntoLocal(leftDocs, rightDocs, "pull", 100000)
  const backward = mergeRemoteIntoLocal(rightDocs, leftDocs, "push", 100000)
  await localAdapter.upsertDocs(forward.toUpsert)
  await right.localAdapter.upsertDocs(backward.toUpsert)
  expect(await storage.getTask(task.id)).toMatchObject({status: "backlog", scheduled: null, content: docs.tasks[0].content})
  expect(await rightStorage.getTask(task.id)).toEqual(await storage.getTask(task.id))
  state = await storage.getTaskWorkflow(task.id)
  expect(state.proposals[0].conflict).toBe(true)
  expect(state.records.filter((record) => record.command.kind === "resolve")).toHaveLength(2)
  expect((await rightStorage.getTaskWorkflow(task.id)).proposals).toEqual(state.proposals)
})

it("accepts real epoch interval endpoints rounded from fractional monotonic observations", async () => {
  const core = makeControllerHarness()
  cleanups.push(() => core.db.close())
  let wall = Date.parse("2030-01-01T00:00:00Z")
  let monotonic = 0.25
  const storage = new WorkStorage(core, core.db, () => {}, {runtimeId: "fractional", now: () => wall, monotonicNow: () => monotonic})
  const task = core.taskModel.createTask(makeTaskInput())!
  let state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {taskId: task.id, operationId: "fractional-start", expectedRevision: state.revision, kind: "session_start", sessionId: "fractional"},
    {actorId: "agent", source: {kind: "mcp"}},
  )
  wall += 1001
  monotonic = 1000.6
  state = await storage.getTaskWorkflow(task.id)
  await storage.executeTaskWorkflow(
    {
      taskId: task.id,
      operationId: "fractional-finish",
      expectedRevision: state.revision,
      kind: "session_update",
      sessionId: "fractional",
      state: "finished",
    },
    {actorId: "agent", source: {kind: "mcp"}},
  )
  expect(isValidSnapshot(buildSnapshot(await core.localAdapter.loadAllDocs()))).toBe(true)
  expect((await storage.getTask(task.id))?.spentTime).toBe(1)
})

it.each<Snapshot["version"]>([17, 18, 19])("reads genuine v%d retained records without inventing new proposal authority", async (version) => {
  const {docs, record, task} = await makeHarness()
  const {schema: _schema, effectiveChanges: _effectiveChanges, originalValues, sessionId, sessionState, receipt, ...base} = record
  const {outcome: _outcome, proposalId: _proposalId, ...legacyReceipt} = receipt
  const {checkpointMonotonic: _checkpoint, proposalCommentId: _comment, ...v17} = base
  const legacy =
    version === 19
      ? {...base, schema: 2, originalValues, sessionId, sessionState, receipt: legacyReceipt}
      : version === 18
        ? {...base, receipt: legacyReceipt}
        : {...v17, receipt: legacyReceipt}
  const legacyDocs = {...docs, workflowRecords: [legacy as TaskWorkflowRecord]}
  expect(isValidSnapshot({...buildSnapshot(docs), version, docs: legacyDocs})).toBe(true)
  const normalized = normalizeSnapshotDocs(legacyDocs, version)
  const target = makeControllerHarness()
  cleanups.push(() => target.db.close())
  await target.localAdapter.upsertDocs(normalized)
  const targetStorage = new WorkStorage(target, target.db, () => {})
  const state = await targetStorage.getTaskWorkflow(task.id)
  expect(state.records).toEqual(normalized.workflowRecords)
  expect(state.sessions).toMatchObject([{sessionId: "session", state: "working"}])
})

it("rejects an impossible correction baseline even when a legacy task omits its spent total", async () => {
  const {docs, localAdapter} = await makeHarness()
  const {spent_time: _spent, ...legacy} = docs.tasks[0]
  const incoming = {...docs, tasks: [{...legacy, workflow_time_baseline: 100} as (typeof docs.tasks)[0]]}
  await expect(localAdapter.upsertDocs(incoming)).rejects.toMatchObject({code: "invalid_request"})
  expect(await localAdapter.loadAllDocs()).toEqual(docs)
})
