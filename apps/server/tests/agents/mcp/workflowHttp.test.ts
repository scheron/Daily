import {rmSync} from "node:fs"
import {performance} from "node:perf_hooks"
import {expect, it, vi} from "vitest"

import {WorkStorage} from "@daily/core/storage/WorkStorage"
import {buildSnapshot} from "@daily/core/utils/sync/snapshot/buildSnapshot"
import {normalizeSnapshotDocs} from "@daily/core/utils/sync/snapshot/normalizeSnapshotDocs"
import {AGENT_ENDPOINT_PATH, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {makeTaskDraft, openMacCore} from "../helpers"
import {
  bootAgentServer,
  claimParent,
  claudeCodeDocument,
  codexDocument,
  connectAgent,
  openAgentWindowOver,
  registerClientDocument,
  startClientDocumentServer,
} from "../oauth/harness"

import type {Snapshot, Task, TaskWorkflowCommand, TaskWorkflowReceipt, TaskWorkflowState} from "@daily/protocol"

type WorkflowFailure = {error: {code: string; message: string; current?: TaskWorkflowState}}

it("an OAuth-connected agent discovers the guarded task workflow through initialize and tools/list", async () => {
  const server = await bootAgentServer()
  const documents = await startClientDocumentServer()
  try {
    const parent = await claimParent(server)
    const clientId = registerClientDocument(documents, "/workflow-client.json", claudeCodeDocument)
    await openAgentWindowOver(server, parent.token)
    const connected = await connectAgent(server, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})

    const initialize = await fetch(`${server.baseUrl}${AGENT_ENDPOINT_PATH}`, {
      method: "POST",
      headers: {authorization: `Bearer ${connected.accessToken}`, "content-type": "application/json"},
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {protocolVersion: "2025-11-25", capabilities: {}, clientInfo: {name: "workflow-test", version: "1"}},
      }),
    })
    expect(initialize.status).toBe(200)
    const initialized = (await initialize.json()) as {result: {protocolVersion: string; instructions?: string}}
    expect(initialized.result.protocolVersion).toBe("2025-11-25")

    const notification = await fetch(`${server.baseUrl}${AGENT_ENDPOINT_PATH}`, {
      method: "POST",
      headers: {authorization: `Bearer ${connected.accessToken}`, "content-type": "application/json", "mcp-protocol-version": "2025-11-25"},
      body: JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"}),
    })
    expect(notification.status).toBe(202)

    const list = await fetch(`${server.baseUrl}${AGENT_ENDPOINT_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${connected.accessToken}`,
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/list", params: {}}),
    })
    expect(list.status).toBe(200)
    const listed = (await list.json()) as {result: {tools: {name: string}[]}}
    expect(listed.result.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["get_task_workflow", "update_task_workflow"]))
    expect(initialized.result.instructions).toContain("get_task_workflow")
  } finally {
    await documents.close()
    await server.close()
  }
})

it("HTTP transitions persist receipts, reject a stale concurrent decision, and survive reopening SQLite", async () => {
  const harness = await makeWorkflowHttpHarness()
  try {
    const initial = await harness.getWorkflow()
    expect(initial.task.status).toBe("ready_for_agent")
    const planning = await harness.update({
      taskId: harness.taskId,
      operationId: "plan",
      expectedRevision: initial.revision,
      kind: "transition",
      stage: "planning",
    })
    expect((await harness.getWorkflow()).task.status).toBe("ready_for_agent")

    const command: TaskWorkflowCommand = {
      taskId: harness.taskId,
      operationId: "implement",
      expectedRevision: planning.revision,
      kind: "transition",
      stage: "implementation",
    }
    const [first, second] = await Promise.all([
      harness.call<TaskWorkflowReceipt | WorkflowFailure>("update_task_workflow", command),
      harness.call<TaskWorkflowReceipt | WorkflowFailure>("update_task_workflow", {...command, operationId: "concurrent-implement"}),
    ])
    expect([first.isError === true, second.isError === true].sort()).toEqual([false, true])
    const winner = first.isError ? second : first
    const loser = first.isError ? first : second
    const receipt = winner.data as TaskWorkflowReceipt
    expect(loser.data).toMatchObject({error: {code: "stale_revision", current: {revision: receipt.revision, task: {status: "in_progress"}}}})
    const committedCommand = {...command, operationId: receipt.operationId}
    expect(await harness.update(committedCommand)).toEqual(receipt)

    const handoff = await harness.update({
      taskId: harness.taskId,
      operationId: "handoff",
      expectedRevision: receipt.revision,
      kind: "transition",
      stage: "ready_to_merge",
    })
    expect((await harness.getWorkflow()).task.status).toBe("ready_to_merge")
    await harness.restart()
    const reopened = await harness.getWorkflow()
    expect(reopened.revision).toBe(handoff.revision)
    expect(reopened.records.map((record) => record.command.operationId).sort()).toEqual(["plan", receipt.operationId, "handoff"].sort())
    expect(await harness.update(committedCommand)).toEqual(receipt)

    const reused = await harness.call<WorkflowFailure>("update_task_workflow", {...committedCommand, stage: "ready_to_merge"})
    expect(reused.isError).toBe(true)
    expect(reused.data.error.code).toBe("conflict")
    await harness.update({
      taskId: harness.taskId,
      operationId: "rework",
      expectedRevision: reopened.revision,
      kind: "transition",
      stage: "implementation",
    })
    expect((await harness.getWorkflow()).task.status).toBe("in_progress")
  } finally {
    await harness.close()
  }
})

it("HTTP proposals stay pending across restart and forged approval while trusted human edits retain authority", async () => {
  const harness = await makeWorkflowHttpHarness()
  try {
    const initial = await harness.getWorkflow()
    const changes: Extract<TaskWorkflowCommand, {kind: "propose"}>["changes"] = {scheduled: null, estimatedTime: 1800, priority: "high"}
    const reason = "The migration needs an independent restart verification pass."
    const receipt = await harness.update({
      taskId: harness.taskId,
      operationId: "proposal",
      expectedRevision: initial.revision,
      kind: "propose",
      changes,
      reason,
    })
    const proposed = await harness.getWorkflow()
    expect(proposed.task).toMatchObject({scheduled: initial.task.scheduled, estimatedTime: 0, priority: "none", spentTime: 12})
    expect(proposed.proposals).toEqual([
      {id: receipt.recordId, commentId: expect.any(String), actorId: expect.any(String), changes, reason, status: "pending"},
    ])
    const detail = await harness.call<{comments: {content: string; kind: string; provider: string}[]}>("get_task", {id: harness.taskId})
    expect(detail.isError).not.toBe(true)
    expect(detail.data.comments).toEqual([expect.objectContaining({content: expect.stringContaining(reason), kind: "mcp", provider: "Claude Code"})])

    const forged = await harness.call<WorkflowFailure>("update_task_workflow", {
      taskId: harness.taskId,
      operationId: "forged-approval",
      expectedRevision: proposed.revision,
      kind: "approve",
      proposalId: receipt.recordId,
      approved: true,
    })
    expect(forged.isError).toBe(true)
    expect(forged.data.error.code).toBe("INVALID_INPUT")
    const legacy = await harness.call<WorkflowFailure>("save_task", {id: harness.taskId, status: "done", estimatedTime: 1800, approved: true})
    expect(legacy.isError).toBe(true)
    expect(legacy.data.error.code).toBe("WORKFLOW_REQUIRED")
    expect((await harness.getWorkflow()).revision).toBe(proposed.revision)

    await harness.restart()
    expect((await harness.getWorkflow()).proposals).toEqual(proposed.proposals)
    await harness.humanUpdate({...changes, spentTime: 45})
    const humanEdited = await harness.getWorkflow()
    expect(humanEdited.task).toMatchObject({...changes, spentTime: 45})
    expect(humanEdited.proposals).toEqual(proposed.proposals)
    await harness.humanUpdate({status: "done"})
    const completed = await harness.getWorkflow()
    expect(completed.task).toMatchObject({status: "done", spentTime: 45})
    const reopen = await harness.call<WorkflowFailure>("update_task_workflow", {
      taskId: harness.taskId,
      operationId: "agent-reopen",
      expectedRevision: completed.revision,
      kind: "transition",
      stage: "planning",
    })
    expect(reopen.isError).toBe(true)
    expect(reopen.data).toMatchObject({error: {code: "forbidden", current: {task: {status: "done"}}}})

    await harness.humanUpdate({status: "ready_for_agent", scheduled: null})
    const undated = await harness.getWorkflow()
    const implementation = await harness.call<WorkflowFailure>("update_task_workflow", {
      taskId: harness.taskId,
      operationId: "unscheduled-implementation",
      expectedRevision: undated.revision,
      kind: "transition",
      stage: "implementation",
    })
    expect(implementation.isError).toBe(true)
    expect(implementation.data).toMatchObject({error: {code: "forbidden", current: {task: {scheduled: null, status: "ready_for_agent"}}}})
  } finally {
    await harness.close()
  }
})

it("HTTP sessions credit the union of confirmed work, include the 60-second boundary, and exclude expiry and restart tails", async () => {
  const harness = await makeWorkflowHttpHarness()
  const otherToken = await harness.connectAnotherAgent()
  const origin = Math.floor(Date.now() / 1000) * 1000
  vi.useFakeTimers({toFake: ["Date"]})
  let monotonic = 0
  const monotonicClock = vi.spyOn(performance, "now").mockImplementation(() => monotonic)
  try {
    vi.setSystemTime(origin)
    const initial = await harness.getWorkflow()
    const started = await harness.update({
      taskId: harness.taskId,
      operationId: "start-a",
      expectedRevision: initial.revision,
      kind: "start",
      sessionId: "a",
    })
    expect(started.confirmedSeconds).toBe(0)
    expect((await harness.getWorkflow()).task.status).toBe("ready_for_agent")
    vi.setSystemTime(origin + 10_000)
    monotonic = 10_000
    const otherStart = await harness.call<TaskWorkflowReceipt>(
      "update_task_workflow",
      {
        taskId: harness.taskId,
        operationId: "start-b",
        expectedRevision: started.revision,
        kind: "start",
        sessionId: "b",
      },
      otherToken,
    )
    expect(otherStart.isError).not.toBe(true)
    expect(new Set((await harness.getWorkflow()).activeSessions.map((session) => session.actorId)).size).toBe(2)
    vi.setSystemTime(origin + 15_000)
    monotonic = 15_000
    const wrongActor = await harness.call<WorkflowFailure>(
      "update_task_workflow",
      {
        taskId: harness.taskId,
        operationId: "wrong-actor",
        expectedRevision: otherStart.data.revision,
        kind: "heartbeat",
        sessionId: "a",
      },
      otherToken,
    )
    expect(wrongActor.isError).toBe(true)
    expect(wrongActor.data.error.code).toBe("session_expired")
    vi.setSystemTime(origin + 20_000)
    monotonic = 20_000
    const heartbeat = await harness.update({
      taskId: harness.taskId,
      operationId: "heartbeat-a",
      expectedRevision: otherStart.data.revision,
      kind: "heartbeat",
      sessionId: "a",
    })
    expect(heartbeat.confirmedSeconds).toBe(20)
    vi.setSystemTime(origin + 30_000)
    monotonic = 30_000
    const pauseOther: TaskWorkflowCommand = {
      taskId: harness.taskId,
      operationId: "pause-b",
      expectedRevision: heartbeat.revision,
      kind: "pause",
      sessionId: "b",
    }
    const otherPaused = await harness.call<TaskWorkflowReceipt>("update_task_workflow", pauseOther, otherToken)
    expect(otherPaused.isError).not.toBe(true)
    expect(otherPaused.data.confirmedSeconds).toBe(30)
    vi.setSystemTime(origin + 40_000)
    monotonic = 40_000
    const paused = await harness.update({
      taskId: harness.taskId,
      operationId: "pause-a",
      expectedRevision: otherPaused.data.revision,
      kind: "pause",
      sessionId: "a",
    })
    expect(paused.confirmedSeconds).toBe(40)
    expect((await harness.getWorkflow()).task.spentTime).toBe(52)
    expect((await harness.call<TaskWorkflowReceipt>("update_task_workflow", pauseOther, otherToken)).data).toEqual(otherPaused.data)

    vi.setSystemTime(origin + 70_000)
    monotonic = 70_000
    const bounded = await harness.update({
      taskId: harness.taskId,
      operationId: "start-bounded",
      expectedRevision: paused.revision,
      kind: "start",
      sessionId: "bounded",
    })
    vi.setSystemTime(origin + 130_000)
    monotonic = 130_000
    const boundary = await harness.update({
      taskId: harness.taskId,
      operationId: "boundary",
      expectedRevision: bounded.revision,
      kind: "heartbeat",
      sessionId: "bounded",
    })
    expect(boundary.confirmedSeconds).toBe(100)
    vi.setSystemTime(origin + 190_001)
    monotonic = 190_001
    const expired = await harness.call<WorkflowFailure>("update_task_workflow", {
      taskId: harness.taskId,
      operationId: "expired",
      expectedRevision: boundary.revision,
      kind: "heartbeat",
      sessionId: "bounded",
    })
    expect(expired.isError).toBe(true)
    expect(expired.data).toMatchObject({error: {code: "session_expired", current: {confirmedSeconds: 100}}})
    const stopped = await harness.update({
      taskId: harness.taskId,
      operationId: "close-expired",
      expectedRevision: boundary.revision,
      kind: "pause",
      sessionId: "bounded",
    })
    expect(stopped.confirmedSeconds).toBe(100)
    const beforeRestart = await harness.update({
      taskId: harness.taskId,
      operationId: "start-restart",
      expectedRevision: stopped.revision,
      kind: "start",
      sessionId: "restart",
    })
    vi.setSystemTime(origin + 200_001)
    monotonic = 200_001
    await harness.restart()
    const restarted = await harness.getWorkflow()
    expect(restarted.activeSessions).toEqual([expect.objectContaining({sessionId: "restart", expired: true})])
    expect(restarted.confirmedSeconds).toBe(100)
    const restartHeartbeat = await harness.call<WorkflowFailure>("update_task_workflow", {
      taskId: harness.taskId,
      operationId: "restart-tail",
      expectedRevision: beforeRestart.revision,
      kind: "heartbeat",
      sessionId: "restart",
    })
    expect(restartHeartbeat.isError).toBe(true)
    expect(restartHeartbeat.data.error.code).toBe("session_expired")
    const fresh = await harness.update({
      taskId: harness.taskId,
      operationId: "start-fresh",
      expectedRevision: restarted.revision,
      kind: "start",
      sessionId: "fresh",
    })
    vi.setSystemTime(origin + 205_001)
    monotonic = 205_001
    const last = await harness.update({
      taskId: harness.taskId,
      operationId: "pause-fresh",
      expectedRevision: fresh.revision,
      kind: "pause",
      sessionId: "fresh",
    })
    expect(last.confirmedSeconds).toBe(105)
    expect((await harness.getWorkflow()).task.spentTime).toBe(117)
    await harness.humanUpdate({spentTime: 50})
    const corrected = await harness.getWorkflow()
    expect(corrected.task.spentTime).toBe(50)
    expect(corrected.confirmedSeconds).toBe(105)
    vi.setSystemTime(origin + 210_001)
    monotonic = 210_001
    const resumed = await harness.update({
      taskId: harness.taskId,
      operationId: "start-after-correction",
      expectedRevision: corrected.revision,
      kind: "start",
      sessionId: "after-correction",
    })
    vi.setSystemTime(origin + 215_001)
    monotonic = 215_001
    const afterCorrection = await harness.update({
      taskId: harness.taskId,
      operationId: "pause-after-correction",
      expectedRevision: resumed.revision,
      kind: "pause",
      sessionId: "after-correction",
    })
    expect(afterCorrection.confirmedSeconds).toBe(110)
    expect((await harness.getWorkflow()).task.spentTime).toBe(55)
  } finally {
    monotonicClock.mockRestore()
    vi.useRealTimers()
    await harness.close()
  }
})

async function makeWorkflowHttpHarness() {
  let server = await bootAgentServer({}, {deleteDataDirOnClose: false})
  const documents = await startClientDocumentServer()
  const mac = openMacCore()
  const parent = await claimParent(server)
  const task = await mac.core.tasksService.createTask(makeTaskDraft({content: "Selected workflow task", status: "ready_for_agent", spentTime: 12}))
  if (!task) throw new Error("expected a fixture task")
  const taskId = task.id
  const snapshot = buildSnapshot(await mac.core.localAdapter.loadAllDocs())
  const seeded = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
    method: "POST",
    headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
    body: JSON.stringify({expectedRevision: null, snapshot}),
  })
  expect(seeded.status).toBe(200)
  const clientId = registerClientDocument(documents, "/workflow-client.json", claudeCodeDocument)
  await openAgentWindowOver(server, parent.token)
  const connected = await connectAgent(server, parent.token, {clientId, redirectUri: "http://localhost:5555/callback", timeZone: "UTC"})
  let requestId = 0

  return {
    taskId,
    call,
    getWorkflow,
    update,
    async connectAnotherAgent() {
      const otherClientId = registerClientDocument(documents, "/other-workflow-client.json", codexDocument)
      await openAgentWindowOver(server, parent.token)
      const other = await connectAgent(server, parent.token, {
        clientId: otherClientId,
        redirectUri: "http://localhost:5555/callback",
        timeZone: "UTC",
      })
      return other.accessToken
    },
    async humanUpdate(updates: Partial<Task>) {
      const response = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {headers: {authorization: `Bearer ${parent.token}`}})
      expect(response.status).toBe(200)
      const read = (await response.json()) as {data: {snapshot: Snapshot; revision: string}}
      await mac.core.localAdapter.upsertDocs(normalizeSnapshotDocs(read.data.snapshot.docs))
      const storage = new WorkStorage(mac.core, mac.db, () => {})
      await storage.updateTask(taskId, updates)
      const write = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
        method: "POST",
        headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
        body: JSON.stringify({expectedRevision: read.data.revision, snapshot: buildSnapshot(await mac.core.localAdapter.loadAllDocs())}),
      })
      expect(write.status).toBe(200)
    },
    async restart() {
      const {dataDir, issuer} = server
      await server.close()
      server = await bootAgentServer({dataDir, publicUrl: issuer}, {deleteDataDirOnClose: false})
    },
    async close() {
      await server.close()
      await documents.close()
      mac.close()
      rmSync(server.dataDir, {recursive: true, force: true})
    },
  }

  async function call<T>(name: string, input: Record<string, unknown>, token = connected.accessToken): Promise<{isError?: boolean; data: T}> {
    const response = await fetch(`${server.baseUrl}${AGENT_ENDPOINT_PATH}`, {
      method: "POST",
      headers: {authorization: `Bearer ${token}`, "content-type": "application/json", "mcp-protocol-version": "2025-11-25"},
      body: JSON.stringify({jsonrpc: "2.0", id: ++requestId, method: "tools/call", params: {name, arguments: input}}),
    })
    expect(response.status).toBe(200)
    const json = (await response.json()) as {result: {isError?: boolean; content: {text: string}[]}}
    expect(json.result).toBeDefined()
    return {...(json.result.isError && {isError: true}), data: JSON.parse(json.result.content[0].text) as T}
  }

  async function getWorkflow(): Promise<TaskWorkflowState> {
    const result = await call<TaskWorkflowState>("get_task_workflow", {taskId})
    expect(result.isError, JSON.stringify(result.data)).not.toBe(true)
    return result.data
  }

  async function update(command: TaskWorkflowCommand): Promise<TaskWorkflowReceipt> {
    const result = await call<TaskWorkflowReceipt>("update_task_workflow", command)
    expect(result.isError, JSON.stringify(result.data)).not.toBe(true)
    return result.data
  }
}
