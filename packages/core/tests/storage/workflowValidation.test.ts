import {afterEach, expect, it} from "vitest"

import {WorkflowRecordModel} from "@core/storage/models/WorkflowRecordModel"
import {WorkStorage} from "@core/storage/WorkStorage"
import {mergeRemoteIntoLocal} from "@core/utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshot} from "@core/utils/sync/snapshot/buildSnapshot"
import {isValidSnapshot} from "@core/utils/sync/snapshot/isValidSnapshot"
import {normalizeSnapshotDocs} from "@core/utils/sync/snapshot/normalizeSnapshotDocs"
import {workflowSpentTime} from "@core/utils/tasks/workflowTime"
import {makeControllerHarness, makeTaskInput} from "../helpers/storageControllerHarness"

import type {TaskWorkflowRecord} from "@daily/protocol"

const cleanups: Array<() => void> = []
afterEach(() => {
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
