import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import Database from "better-sqlite3"
import {afterEach, expect, it} from "vitest"

import {createStorageCore} from "@core/storage/createStorageCore"
import {runMigrations} from "@core/storage/database/scripts/migrate"
import {SyncEngine} from "@core/storage/sync/SyncEngine"
import {WorkStorage} from "@core/storage/WorkStorage"
import {mergeRemoteIntoLocal} from "@core/utils/sync/merge/mergeRemoteIntoLocal"
import {buildSnapshot, buildSnapshotMeta} from "@core/utils/sync/snapshot/buildSnapshot"
import {isValidSnapshot} from "@core/utils/sync/snapshot/isValidSnapshot"
import {normalizeSnapshotDocs} from "@core/utils/sync/snapshot/normalizeSnapshotDocs"
import {makeControllerHarness, makeTaskInput} from "../helpers/storageControllerHarness"

import type {SqliteDriver} from "@core/database/SqliteDriver"
import type {TaskWorkflowCommand, TaskWorkflowRecord} from "@daily/protocol"

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function makeHarness() {
  const core = makeControllerHarness()
  cleanups.push(() => core.db.close())
  let observed = 0
  const storage = new WorkStorage(core, core.db, () => {}, {runtimeId: "redesign", now: () => observed, monotonicNow: () => observed})
  const task = core.taskModel.createTask(makeTaskInput({status: "ready_for_agent", scheduled: null}))!
  return {
    ...core,
    storage,
    task,
    observe(value: number) {
      observed = value
    },
    async run(command: object) {
      const current = await storage.getTaskWorkflow(task.id)
      return storage.executeTaskWorkflow(
        {taskId: task.id, operationId: String(current.records.length), expectedRevision: current.revision, ...command} as TaskWorkflowCommand,
        {actorId: "agent-a", source: {kind: "mcp"}},
      )
    },
  }
}

it("reviews schedule assigning and clearing effects alongside actual status transitions", async () => {
  const {storage, task, run} = makeHarness()
  for (const status of ["in_progress", "backlog"]) {
    await expect(run({kind: "transition", status})).resolves.toMatchObject({kind: "transition", outcome: "proposal_pending"})
    const pending = await storage.getTaskWorkflow(task.id)
    const proposal = pending.proposals.find((item) => item.status === "pending")!
    expect(proposal.changes.status).toBe(status)
    await storage.resolveTaskWorkflowProposal({
      taskId: task.id,
      proposalId: proposal.id,
      decision: "accepted",
      operationId: `accept-${status}`,
      expectedRevision: pending.revision,
    })
    expect(await storage.getTask(task.id)).toMatchObject({status, scheduled: status === "backlog" ? null : {date: expect.any(String)}})
  }
})

it("settles a ten minute host observed working boundary without a required heartbeat", async () => {
  const {storage, task, run, observe} = makeHarness()
  await run({kind: "start", sessionId: "work"})
  observe(600000)
  await expect(run({kind: "pause", sessionId: "work"})).resolves.toMatchObject({confirmedSeconds: 600})
  expect((await storage.getTask(task.id))?.spentTime).toBe(600)
})

it("returns effective persisted guidance and a conservative time policy in task context", async () => {
  const {storage, task} = makeHarness()
  expect(await storage.getTaskWorkflow(task.id)).toMatchObject({
    guidance: {
      allowCompletion: false,
      workspace: {content: expect.any(String)},
      project: {allowCompletion: null},
      timePolicy: {maxObservedIntervalSeconds: 1800, requiresHeartbeat: false},
    },
  })
})

it("syncs scoped guidance revisions and completion overrides without losing concurrent history", async () => {
  const left = makeHarness()
  const right = makeHarness()
  const initial = await left.storage.getWorkflowGuidance("main")
  const update = {
    scope: {kind: "workspace" as const},
    content: "Workspace procedure",
    allowCompletion: true,
    operationId: "workspace",
    expectedRevision: initial.workspace.revision,
  }
  await expect(left.storage.updateWorkflowGuidance(update)).resolves.toMatchObject({content: "Workspace procedure"})
  await right.localAdapter.upsertDocs(await left.localAdapter.loadAllDocs())
  expect(await right.storage.getWorkflowGuidance("main")).toMatchObject({
    allowCompletion: true,
    workspace: {content: "Workspace procedure", history: [{operationId: "workspace"}]},
  })
  const current = await right.storage.getWorkflowGuidance("main")
  await right.storage.updateWorkflowGuidance({
    scope: {kind: "project", projectId: "main"},
    content: "Review this project",
    allowCompletion: false,
    operationId: "project",
    expectedRevision: current.project!.revision,
  })
  await left.localAdapter.upsertDocs(await right.localAdapter.loadAllDocs())
  expect(await left.storage.getWorkflowGuidance("main")).toMatchObject({
    allowCompletion: false,
    project: {content: "Review this project", allowCompletion: false},
  })
  const reconstructed = new WorkStorage(left, left.db, () => {}, {runtimeId: "restart", now: () => 100})
  expect(await reconstructed.getWorkflowGuidance("main")).toEqual(await left.storage.getWorkflowGuidance("main"))
  await expect(left.storage.updateWorkflowGuidance(update)).resolves.toMatchObject({history: [{operationId: "workspace"}]})
  await expect(left.storage.updateWorkflowGuidance({...update, content: "Different"})).rejects.toMatchObject({code: "conflict"})
})

it("requires trusted completion permission and permits rework through actual task statuses", async () => {
  const {storage, task, run} = makeHarness()
  await expect(run({kind: "transition", status: "done"})).rejects.toMatchObject({code: "forbidden"})
  const guidance = await storage.getWorkflowGuidance()
  await storage.updateWorkflowGuidance({
    scope: {kind: "workspace"},
    content: guidance.workspace.content,
    allowCompletion: true,
    operationId: "allow",
    expectedRevision: guidance.workspace.revision,
  })
  await run({kind: "transition", status: "done"})
  const pending = await storage.getTaskWorkflow(task.id)
  expect(pending.task.status).toBe("ready_for_agent")
  await storage.resolveTaskWorkflowProposal({
    taskId: task.id,
    proposalId: pending.proposals[0].id,
    decision: "accepted",
    operationId: "accept-completion-day",
    expectedRevision: pending.revision,
  })
  expect((await storage.getTask(task.id))?.status).toBe("done")
  await run({kind: "transition", status: "in_progress"})
  expect((await storage.getTask(task.id))?.status).toBe("in_progress")
  await run({kind: "transition", status: "cancelled"})
  expect((await storage.getTask(task.id))?.status).toBe("cancelled")
})

it("accepts a planning proposal once, applies domain rules atomically and returns its original receipt on retry", async () => {
  const {storage, task, run} = makeHarness()
  await run({kind: "transition", status: "backlog"})
  await run({
    kind: "propose",
    changes: {scheduled: {date: "2030-05-04", time: "10:00", timezone: "UTC"}, estimatedTime: 90, priority: "high"},
    reason: "Reserve review time",
  })
  const pending = await storage.getTaskWorkflow(task.id)
  expect(pending.proposals[0]).toMatchObject({
    originalValues: {scheduled: null, estimatedTime: 0, priority: "none"},
    status: "pending",
    conflict: false,
  })
  const request = {
    taskId: task.id,
    proposalId: pending.proposals[0].id,
    decision: "accepted" as const,
    operationId: "accept",
    expectedRevision: pending.revision,
  }
  const resolution = storage.resolveTaskWorkflowProposal(request)
  await expect(resolution).resolves.toMatchObject({kind: "resolve"})
  const receipt = await resolution
  expect(await storage.getTask(task.id)).toMatchObject({status: "todo", scheduled: {date: "2030-05-04"}, estimatedTime: 90, priority: "high"})
  await storage.updateTask(task.id, {content: "Human follow-up"})
  expect(await storage.resolveTaskWorkflowProposal(request)).toEqual(receipt)
  expect((await storage.getTaskWorkflow(task.id)).proposals[0]).toMatchObject({status: "accepted", resolutionRecordId: receipt.recordId})
  await expect(storage.resolveTaskWorkflowProposal({...request, decision: "rejected"})).rejects.toMatchObject({code: "conflict"})
})

it("rejects decline then acceptance races and changed original values without partially applying fields", async () => {
  const {storage, task, run} = makeHarness()
  await run({kind: "propose", changes: {estimatedTime: 60, priority: "high"}, reason: "Review"})
  const pending = await storage.getTaskWorkflow(task.id)
  const request = {
    taskId: task.id,
    proposalId: pending.proposals[0].id,
    decision: "rejected" as const,
    operationId: "reject",
    expectedRevision: pending.revision,
  }
  await storage.resolveTaskWorkflowProposal(request)
  await expect(storage.resolveTaskWorkflowProposal({...request, operationId: "race", decision: "accepted"})).rejects.toMatchObject({
    code: "stale_revision",
  })
  const rejected = await storage.getTaskWorkflow(task.id)
  await expect(
    storage.resolveTaskWorkflowProposal({...request, operationId: "later", decision: "accepted", expectedRevision: rejected.revision}),
  ).rejects.toMatchObject({code: "conflict"})
  await run({kind: "propose", changes: {estimatedTime: 120, priority: "urgent"}, reason: "Second review"})
  await storage.updateTask(task.id, {estimatedTime: 7})
  const changed = await storage.getTaskWorkflow(task.id)
  const proposal = changed.proposals.find((item) => item.status === "pending")!
  expect(proposal.conflict).toBe(true)
  await expect(
    storage.resolveTaskWorkflowProposal({
      taskId: task.id,
      proposalId: proposal.id,
      decision: "accepted",
      operationId: "changed",
      expectedRevision: changed.revision,
    }),
  ).rejects.toMatchObject({code: "conflict"})
  expect(await storage.getTask(task.id)).toMatchObject({estimatedTime: 7, priority: "none"})
})

it("keeps session lifecycle independent, drops ambiguous gaps and excludes restart downtime", async () => {
  const core = makeHarness()
  await core.run({kind: "session_start", sessionId: "run", summary: "Reading"})
  core.observe(600000)
  await core.run({kind: "session_update", sessionId: "run", state: "waiting", summary: "Needs input"})
  core.observe(1200000)
  await core.run({kind: "session_update", sessionId: "run", state: "working"})
  core.observe(1201000)
  await core.run({kind: "session_update", sessionId: "run", state: "finished"})
  expect(await core.storage.getTaskWorkflow(core.task.id)).toMatchObject({
    task: {status: "ready_for_agent", spentTime: 601},
    sessions: [{state: "finished", summary: "Needs input"}],
  })
  await core.run({kind: "session_start", sessionId: "gap"})
  core.observe(3001001)
  expect((await core.storage.getTaskWorkflow(core.task.id)).sessions.find((session) => session.sessionId === "gap")?.connection).toBe("uncertain")
  await core.run({kind: "session_update", sessionId: "gap", state: "error"})
  expect((await core.storage.getTask(core.task.id))?.spentTime).toBe(601)
  await core.run({kind: "session_start", sessionId: "restart"})
  const restarted = new WorkStorage(core, core.db, () => {}, {runtimeId: "after-restart", now: () => 4000000, monotonicNow: () => 1000})
  const state = await restarted.getTaskWorkflow(core.task.id)
  expect(state.sessions.find((session) => session.sessionId === "restart")?.connection).toBe("interrupted")
  await restarted.executeTaskWorkflow(
    {
      taskId: core.task.id,
      operationId: "restart-close",
      expectedRevision: state.revision,
      kind: "session_update",
      sessionId: "restart",
      state: "finished",
    },
    {actorId: "agent-a", source: {kind: "mcp"}},
  )
  expect((await restarted.getTask(core.task.id))?.spentTime).toBe(601)
})

it("rolls back mixed task and workflow writes together through a WorkStorage batch", async () => {
  const {storage, task, run} = makeHarness()
  await expect(
    storage.batch(async () => {
      await storage.updateTask(task.id, {content: "Must roll back"}, {kind: "mcp"})
      await run({kind: "propose", changes: {priority: "high"}, reason: "Atomic"})
      throw new Error("rollback")
    }),
  ).rejects.toThrow("rollback")
  expect(await storage.getTask(task.id)).toMatchObject({content: "Task", priority: "none"})
  expect((await storage.getTaskWorkflow(task.id)).records).toHaveLength(0)
  expect(await storage.getCommentsOfTask(task.id)).toHaveLength(0)
})

it("keeps causally newer guidance and session boundaries current when the wall clock moves back", async () => {
  const core = makeHarness()
  core.observe(100000)
  let guidance = await core.storage.getWorkflowGuidance()
  await core.storage.updateWorkflowGuidance({
    scope: {kind: "workspace"},
    content: "First",
    allowCompletion: false,
    operationId: "first",
    expectedRevision: guidance.workspace.revision,
  })
  await core.run({kind: "session_start", sessionId: "clock"})
  core.observe(99000)
  guidance = await core.storage.getWorkflowGuidance()
  await core.storage.updateWorkflowGuidance({
    scope: {kind: "workspace"},
    content: "Second",
    allowCompletion: false,
    operationId: "second",
    expectedRevision: guidance.workspace.revision,
  })
  await core.run({kind: "session_update", sessionId: "clock", state: "waiting"})
  expect(await core.storage.getTaskWorkflow(core.task.id)).toMatchObject({
    guidance: {workspace: {content: "Second"}},
    sessions: [{state: "waiting"}],
    confirmedSeconds: 0,
  })
})

it("pulls a guidance-only snapshot through the sync engine", async () => {
  const left = makeHarness()
  const right = makeHarness()
  await right.localAdapter.upsertDocs(await left.localAdapter.loadAllDocs())
  const guidance = await left.storage.getWorkflowGuidance()
  await left.storage.updateWorkflowGuidance({
    scope: {kind: "workspace"},
    content: "Guidance-only change",
    allowCompletion: true,
    operationId: "guidance-only",
    expectedRevision: guidance.workspace.revision,
  })
  let snapshot = buildSnapshot(await left.localAdapter.loadAllDocs())
  const engine = new SyncEngine(
    right.localAdapter,
    [
      {
        id: "fixture",
        label: "Fixture",
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
    {assetsDir: right.paths.assetsDir, onStatusChange() {}, onDataChanged() {}},
  )
  await engine.syncOnce()
  expect(await right.storage.getWorkflowGuidance()).toMatchObject({allowCompletion: true, workspace: {content: "Guidance-only change"}})
})

it("converges concurrent guidance and proposal decisions while preserving audit and surfacing disagreement", async () => {
  const left = makeHarness()
  const right = makeHarness()
  await left.run({kind: "propose", changes: {priority: "high"}, reason: "Review"})
  await right.localAdapter.upsertDocs(await left.localAdapter.loadAllDocs())
  const pending = await left.storage.getTaskWorkflow(left.task.id)
  const guidance = await left.storage.getWorkflowGuidance()
  await left.storage.updateWorkflowGuidance({
    scope: {kind: "workspace"},
    content: "Left",
    allowCompletion: true,
    operationId: "left-guidance",
    expectedRevision: guidance.workspace.revision,
  })
  await right.storage.updateWorkflowGuidance({
    scope: {kind: "workspace"},
    content: "Right",
    allowCompletion: false,
    operationId: "right-guidance",
    expectedRevision: guidance.workspace.revision,
  })
  const leftState = await left.storage.getTaskWorkflow(left.task.id)
  const rightState = await right.storage.getTaskWorkflow(left.task.id)
  const resolution = {taskId: left.task.id, proposalId: pending.proposals[0].id}
  await left.storage.resolveTaskWorkflowProposal({
    ...resolution,
    operationId: "accept-offline",
    decision: "accepted",
    expectedRevision: leftState.revision,
  })
  await right.storage.resolveTaskWorkflowProposal({
    ...resolution,
    operationId: "reject-offline",
    decision: "rejected",
    expectedRevision: rightState.revision,
  })
  const leftDocs = await left.localAdapter.loadAllDocs()
  const rightDocs = await right.localAdapter.loadAllDocs()
  const forward = mergeRemoteIntoLocal(leftDocs, rightDocs, "pull", 100000)
  const backward = mergeRemoteIntoLocal(rightDocs, leftDocs, "push", 100000)
  expect(buildSnapshotMeta(forward.resultDocs).hash).toBe(buildSnapshotMeta(backward.resultDocs).hash)
  await left.localAdapter.upsertDocs(forward.toUpsert)
  await right.localAdapter.upsertDocs(backward.toUpsert)
  expect((await left.storage.getWorkflowGuidance()).workspace.history).toHaveLength(2)
  expect((await right.storage.getWorkflowGuidance()).workspace).toEqual((await left.storage.getWorkflowGuidance()).workspace)
  expect((await left.storage.getTaskWorkflow(left.task.id)).proposals[0].conflict).toBe(true)
  expect((await right.storage.getTaskWorkflow(left.task.id)).proposals).toEqual((await left.storage.getTaskWorkflow(left.task.id)).proposals)
  await left.storage.updateTask(left.task.id, {priority: "medium"})
  expect((await left.storage.getTask(left.task.id))?.priority).toBe("medium")
})

it.each([17, 18])("preserves v%d immutable proposals without inventing original planning authority", async (version) => {
  const left = makeHarness()
  const right = makeHarness()
  await left.run({kind: "propose", changes: {priority: "high"}, reason: "Legacy review"})
  const docs = await left.localAdapter.loadAllDocs()
  const {
    schema: _schema,
    effectiveChanges: _effectiveChanges,
    originalValues: _originalValues,
    sessionId: _sessionId,
    sessionState: _sessionState,
    checkpointMonotonic,
    proposalCommentId,
    ...original
  } = docs.workflowRecords![0]
  const {outcome: _outcome, proposalId: _proposalId, ...receipt} = original.receipt
  original.receipt = receipt
  const record = version === 17 ? original : {...original, checkpointMonotonic, proposalCommentId}
  const normalized = normalizeSnapshotDocs({...docs, workflowRecords: [record as TaskWorkflowRecord]}, version)
  expect(normalized.workflowRecords![0]).toEqual(version === 17 ? {...original, checkpointMonotonic: null, proposalCommentId: null} : record)
  await right.localAdapter.upsertDocs(normalized)
  const state = await right.storage.getTaskWorkflow(left.task.id)
  expect(state.proposals[0]).toMatchObject({status: "pending", originalValues: {}, conflict: true})
  await expect(
    right.storage.resolveTaskWorkflowProposal({
      taskId: left.task.id,
      proposalId: state.proposals[0].id,
      decision: "accepted",
      operationId: "unsafe-legacy-accept",
      expectedRevision: state.revision,
    }),
  ).rejects.toMatchObject({code: "conflict"})
  await right.storage.resolveTaskWorkflowProposal({
    taskId: left.task.id,
    proposalId: state.proposals[0].id,
    decision: "rejected",
    operationId: "reject-legacy",
    expectedRevision: state.revision,
  })
  const snapshot = buildSnapshot(await right.localAdapter.loadAllDocs())
  expect(isValidSnapshot(snapshot)).toBe(true)
  expect(snapshot.docs.workflowRecords!.find((item) => item.id === original.id)).toEqual(normalized.workflowRecords![0])
})

it("rolls back every accepted field and task event when the audit append fails", async () => {
  const core = makeHarness()
  await core.run({kind: "propose", changes: {priority: "urgent", estimatedTime: 120}, reason: "Atomic review"})
  const pending = await core.storage.getTaskWorkflow(core.task.id)
  const before = await core.localAdapter.loadAllDocs()
  core.db.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON workflow_records BEGIN SELECT RAISE(ABORT, 'Audit unavailable'); END")
  await expect(
    core.storage.resolveTaskWorkflowProposal({
      taskId: core.task.id,
      proposalId: pending.proposals[0].id,
      decision: "accepted",
      operationId: "audit-failure",
      expectedRevision: pending.revision,
    }),
  ).rejects.toThrow("Audit unavailable")
  expect(await core.localAdapter.loadAllDocs()).toEqual(before)
})

it("uses the host caller date, time and timezone when a status assigns the first schedule", async () => {
  const core = makeHarness()
  const storage = new WorkStorage(core, core.db, () => {}, {
    runtimeId: "caller",
    now: () => Date.parse("2030-01-01T12:30:00Z"),
    scheduledNow() {
      return {date: "2030-01-02", time: "01:30:00", timezone: "Pacific/Auckland"}
    },
  })
  const state = await storage.getTaskWorkflow(core.task.id)
  await storage.executeTaskWorkflow(
    {taskId: core.task.id, operationId: "caller-date", expectedRevision: state.revision, kind: "transition", status: "todo"},
    {actorId: "caller", source: {kind: "mcp"}},
  )
  const pending = await storage.getTaskWorkflow(core.task.id)
  expect(pending.task.scheduled).toBeNull()
  expect(pending.proposals[0].changes.scheduled).toEqual({date: "2030-01-02", time: "01:30:00", timezone: "Pacific/Auckland"})
  await storage.resolveTaskWorkflowProposal({
    taskId: core.task.id,
    proposalId: pending.proposals[0].id,
    decision: "accepted",
    operationId: "accept-caller-day",
    expectedRevision: pending.revision,
  })
  expect((await storage.getTask(core.task.id))?.scheduled).toEqual({date: "2030-01-02", time: "01:30:00", timezone: "Pacific/Auckland"})
})

it("preserves the smaller observed elapsed interval across normal clock sampling drift", async () => {
  const core = makeHarness()
  let wall = 0
  let monotonic = 0
  const storage = new WorkStorage(core, core.db, () => {}, {runtimeId: "drift", now: () => wall, monotonicNow: () => monotonic})
  let state = await storage.getTaskWorkflow(core.task.id)
  await storage.executeTaskWorkflow(
    {taskId: core.task.id, operationId: "drift-start", expectedRevision: state.revision, kind: "session_start", sessionId: "drift"},
    {actorId: "drift", source: {kind: "mcp"}},
  )
  wall = 10000
  monotonic = 9990
  state = await storage.getTaskWorkflow(core.task.id)
  await storage.executeTaskWorkflow(
    {taskId: core.task.id, operationId: "drift-end", expectedRevision: state.revision, kind: "session_update", sessionId: "drift", state: "finished"},
    {actorId: "drift", source: {kind: "mcp"}},
  )
  expect((await storage.getTask(core.task.id))?.spentTime).toBe(9)
})

it("rejects imported session metadata that disagrees with its immutable command before writing other collections", async () => {
  const left = makeHarness()
  const right = makeHarness()
  await left.run({kind: "session_start", sessionId: "real-session"})
  const before = await right.localAdapter.loadAllDocs()
  const incoming = await left.localAdapter.loadAllDocs()
  incoming.branches[0].name = "Must not write"
  incoming.workflowRecords![0].sessionId = "invented-session"
  await expect(right.localAdapter.upsertDocs(incoming)).rejects.toMatchObject({code: "invalid_request"})
  expect(await right.localAdapter.loadAllDocs()).toEqual(before)
})

it("persists guidance, both proposal decisions, session history and confirmed time across an actual database close and reopen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "daily-workflow-restart-"))
  const paths = {
    appDataRoot: () => directory,
    dbPath: () => join(directory, "daily.sqlite"),
    assetsDir: () => join(directory, "assets"),
    remoteSyncPath: () => join(directory, "remote"),
  }
  let native = new Database(paths.dbPath())
  let observed = 100000
  function openStorage(runtimeId: string) {
    const db = native as unknown as SqliteDriver
    runMigrations(db)
    return new WorkStorage(createStorageCore(db, paths), db, () => {}, {runtimeId, now: () => observed, monotonicNow: () => observed})
  }
  try {
    let storage = openStorage("before-close")
    const created = await storage.createTask(makeTaskInput({id: "restart-task", status: "in_progress"}))
    const task = created.tasks!.upserted![0]
    let guidance = await storage.getWorkflowGuidance("main")
    await storage.updateWorkflowGuidance({
      scope: {kind: "workspace"},
      content: "Persistent workspace",
      allowCompletion: true,
      operationId: "persistent-workspace",
      expectedRevision: guidance.workspace.revision,
    })
    guidance = await storage.getWorkflowGuidance("main")
    await storage.updateWorkflowGuidance({
      scope: {kind: "project", projectId: "main"},
      content: "Persistent project",
      allowCompletion: null,
      operationId: "persistent-project",
      expectedRevision: guidance.project!.revision,
    })
    let state = await storage.getTaskWorkflow(task.id)
    await storage.executeTaskWorkflow(
      {
        taskId: task.id,
        operationId: "persistent-proposal",
        expectedRevision: state.revision,
        kind: "propose",
        changes: {priority: "high"},
        reason: "Durable review",
      },
      {actorId: "persistent", source: {kind: "mcp"}},
    )
    state = await storage.getTaskWorkflow(task.id)
    await storage.resolveTaskWorkflowProposal({
      taskId: task.id,
      operationId: "persistent-accept",
      expectedRevision: state.revision,
      proposalId: state.proposals[0].id,
      decision: "accepted",
    })
    state = await storage.getTaskWorkflow(task.id)
    await storage.executeTaskWorkflow(
      {
        taskId: task.id,
        operationId: "persistent-declined-proposal",
        expectedRevision: state.revision,
        kind: "propose",
        changes: {estimatedTime: 100},
        reason: "Declined review",
      },
      {actorId: "persistent", source: {kind: "mcp"}},
    )
    state = await storage.getTaskWorkflow(task.id)
    await storage.resolveTaskWorkflowProposal({
      taskId: task.id,
      operationId: "persistent-reject",
      expectedRevision: state.revision,
      proposalId: state.proposals.find((proposal) => proposal.status === "pending")!.id,
      decision: "rejected",
    })
    state = await storage.getTaskWorkflow(task.id)
    await storage.executeTaskWorkflow(
      {taskId: task.id, operationId: "persistent-start", expectedRevision: state.revision, kind: "session_start", sessionId: "persistent"},
      {actorId: "persistent", source: {kind: "mcp"}},
    )
    observed += 10000
    state = await storage.getTaskWorkflow(task.id)
    await storage.executeTaskWorkflow(
      {
        taskId: task.id,
        operationId: "persistent-wait",
        expectedRevision: state.revision,
        kind: "session_update",
        sessionId: "persistent",
        state: "waiting",
        summary: "Awaiting review",
      },
      {actorId: "persistent", source: {kind: "mcp"}},
    )
    const before = await storage.getTaskWorkflow(task.id)
    native.close()
    observed += 3600000
    native = new Database(paths.dbPath())
    storage = openStorage("after-close")
    const reopened = await storage.getTaskWorkflow(task.id)
    expect(reopened).toMatchObject({
      task: {priority: "high", spentTime: 10},
      proposals: expect.arrayContaining([expect.objectContaining({status: "accepted"}), expect.objectContaining({status: "rejected"})]),
      sessions: [{state: "waiting", connection: "interrupted", summary: "Awaiting review"}],
      guidance: {allowCompletion: true, workspace: {content: "Persistent workspace"}, project: {content: "Persistent project"}},
    })
    expect(reopened.records).toEqual(before.records)
    expect(reopened.revision).toBe(before.revision)
  } finally {
    native.close()
    rmSync(directory, {recursive: true, force: true})
  }
})

it("returns task audit history in causal order for chronological presentation", async () => {
  const core = makeHarness()
  for (const operationId of ["first-history", "second-history", "third-history"]) {
    const state = await core.storage.getTaskWorkflow(core.task.id)
    await core.storage.executeTaskWorkflow(
      {taskId: core.task.id, operationId, expectedRevision: state.revision, kind: "propose", changes: {priority: "high"}, reason: operationId},
      {actorId: "ordered", source: {kind: "mcp"}},
    )
  }
  expect((await core.storage.getTaskWorkflow(core.task.id)).records.map((record) => record.command.operationId)).toEqual([
    "first-history",
    "second-history",
    "third-history",
  ])
})
