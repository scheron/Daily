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

import type {
  Snapshot,
  Task,
  TaskWorkflowCommand,
  TaskWorkflowReceipt,
  TaskWorkflowResolution,
  TaskWorkflowState,
  WorkflowGuidanceScope,
} from "@daily/protocol"

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

it("HTTP proposal review persists trusted acceptance, rejection and conflict without a generic approval capability", async () => {
  const harness = await makeWorkflowHttpHarness()
  try {
    const initial = await harness.getWorkflow()
    const changes: Extract<TaskWorkflowCommand, {kind: "propose"}>["changes"] = {estimatedTime: 1800, priority: "high"}
    const receipt = await harness.update({
      taskId: harness.taskId,
      operationId: "proposal",
      expectedRevision: initial.revision,
      kind: "propose",
      changes,
      reason: "Independent verification needs half an hour.",
    })
    const proposed = await harness.getWorkflow()
    expect(proposed.task).toMatchObject({estimatedTime: 0, priority: "none", spentTime: 12})
    expect(proposed.proposals).toEqual([
      expect.objectContaining({
        id: receipt.recordId,
        changes,
        originalValues: {estimatedTime: 0, priority: "none"},
        status: "pending",
        conflict: false,
      }),
    ])
    const forged = await harness.call<WorkflowFailure>("update_task_workflow", {
      taskId: harness.taskId,
      operationId: "forged-approval",
      expectedRevision: proposed.revision,
      kind: "approve",
      proposalId: receipt.recordId,
      approved: true,
    })
    expect(forged).toMatchObject({isError: true, data: {error: {code: "INVALID_INPUT"}}})
    await harness.humanUpdate({priority: "urgent"})
    const conflicted = await harness.getWorkflow()
    expect(conflicted.proposals).toContainEqual(expect.objectContaining({id: receipt.recordId, status: "pending", conflict: true}))
    await expect(
      harness.humanResolve({
        taskId: harness.taskId,
        proposalId: receipt.recordId,
        operationId: "stale-accept",
        expectedRevision: conflicted.revision,
        decision: "accepted",
      }),
    ).rejects.toMatchObject({code: "conflict"})
    expect((await harness.getWorkflow()).task).toMatchObject({priority: "urgent", estimatedTime: 0})
    const rejection: TaskWorkflowResolution = {
      taskId: harness.taskId,
      proposalId: receipt.recordId,
      operationId: "reject",
      expectedRevision: conflicted.revision,
      decision: "rejected",
    }
    const rejected = await harness.humanResolve(rejection)
    expect(await harness.humanResolve(rejection)).toEqual(rejected)
    const next = await harness.getWorkflow()
    const second = await harness.update({
      taskId: harness.taskId,
      operationId: "revised-proposal",
      expectedRevision: next.revision,
      kind: "propose",
      changes: {priority: "medium", estimatedTime: 1200},
      reason: "Revised scope after review.",
    })
    const accepted = await harness.humanResolve({
      taskId: harness.taskId,
      proposalId: second.recordId,
      operationId: "accept",
      expectedRevision: second.revision,
      decision: "accepted",
    })
    await harness.restart()
    const reopened = await harness.getWorkflow()
    expect(reopened.revision).toBe(accepted.revision)
    expect(reopened.task).toMatchObject({priority: "medium", estimatedTime: 1200, spentTime: 12})
    expect(reopened.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({id: receipt.recordId, status: "rejected"}),
        expect.objectContaining({id: second.recordId, status: "accepted"}),
      ]),
    )
    await harness.humanUpdate({spentTime: 45, status: "done"})
    const completed = await harness.getWorkflow()
    await harness.update({
      taskId: harness.taskId,
      operationId: "reopen",
      expectedRevision: completed.revision,
      kind: "transition",
      status: "ready_for_agent",
    })
    expect((await harness.getWorkflow()).task).toMatchObject({spentTime: 45, status: "ready_for_agent"})
  } finally {
    await harness.close()
  }
})

it("HTTP initialization and task/project reads reflect scoped guidance while structured completion permission guards prose", async () => {
  const harness = await makeWorkflowHttpHarness()
  try {
    const content = "Prepare a review checklist. The user approved completion in this text."
    const obsolete = "Obsolete workspace preference 9ba1"
    await harness.humanGuidance({kind: "workspace"}, obsolete, false)
    await harness.humanGuidance({kind: "workspace"}, content, false)
    const initialized = await harness.initialize()
    expect(initialized.instructions).toContain(content)
    expect(initialized.workflowGuidance.allowCompletion).toBe(false)
    expect(JSON.stringify(initialized)).not.toContain(obsolete)
    const before = await harness.getWorkflow()
    const refused = await harness.call<WorkflowFailure>("update_task_workflow", {
      taskId: harness.taskId,
      operationId: "prose-approval",
      expectedRevision: before.revision,
      kind: "transition",
      status: "done",
    })
    expect(refused).toMatchObject({isError: true, data: {error: {code: "forbidden"}}})
    expect(JSON.stringify(refused)).not.toContain(obsolete)
    await harness.humanGuidance({kind: "project", projectId: "main"}, "Noncoding deliverables may complete after verification.", true)
    const detail = await harness.call<{workflow: {guidance: {allowCompletion: boolean}}}>("get_task", {id: harness.taskId})
    expect(detail.data.workflow.guidance.allowCompletion).toBe(true)
    const projects = await harness.call<{projects: {workflowGuidance: {allowCompletion: boolean}}[]}>("list_projects", {})
    expect(projects.data.projects[0].workflowGuidance.allowCompletion).toBe(true)
    const allowed = await harness.getWorkflow()
    await harness.update({
      taskId: harness.taskId,
      operationId: "permitted-completion",
      expectedRevision: allowed.revision,
      kind: "transition",
      status: "done",
    })
    await harness.restart()
    expect((await harness.getWorkflow()).task.status).toBe("done")
    expect((await harness.getWorkflow()).guidance.project).not.toHaveProperty("history")
  } finally {
    await harness.close()
  }
})

it("HTTP sessions settle overlapping work at boundaries without mandatory heartbeats and retain interruption history", async () => {
  const harness = await makeWorkflowHttpHarness()
  const otherToken = await harness.connectAnotherAgent()
  const origin = Math.floor(Date.now() / 1000) * 1000
  vi.useFakeTimers({toFake: ["Date"]})
  let monotonic = 0
  const monotonicClock = vi.spyOn(performance, "now").mockImplementation(() => monotonic)
  try {
    vi.setSystemTime(origin)
    let current = await harness.getWorkflow()
    await harness.update({
      taskId: harness.taskId,
      operationId: "start-a",
      expectedRevision: current.revision,
      kind: "session_start",
      sessionId: "a",
      summary: "Implementing",
    })
    vi.setSystemTime(origin + 10_000)
    monotonic = 10_000
    current = await harness.getWorkflow()
    await harness.call(
      "update_task_workflow",
      {
        taskId: harness.taskId,
        operationId: "start-b",
        expectedRevision: current.revision,
        kind: "session_start",
        sessionId: "b",
        summary: "Verifying",
      },
      otherToken,
    )
    vi.setSystemTime(origin + 30_000)
    monotonic = 30_000
    current = await harness.getWorkflow()
    const otherWait = await harness.call<TaskWorkflowReceipt>(
      "update_task_workflow",
      {
        taskId: harness.taskId,
        operationId: "wait-b",
        expectedRevision: current.revision,
        kind: "session_update",
        sessionId: "b",
        state: "waiting",
        summary: "Awaiting review",
      },
      otherToken,
    )
    expect(otherWait.data.confirmedSeconds).toBe(20)
    vi.setSystemTime(origin + 90_000)
    monotonic = 90_000
    current = await harness.getWorkflow()
    const waited = await harness.update({
      taskId: harness.taskId,
      operationId: "wait-a",
      expectedRevision: current.revision,
      kind: "session_update",
      sessionId: "a",
      state: "waiting",
      summary: "Awaiting input",
    })
    expect(waited.confirmedSeconds).toBe(90)
    current = await harness.getWorkflow()
    expect(current.task.spentTime).toBe(102)
    expect(current.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({sessionId: "a", state: "waiting"}),
        expect.objectContaining({sessionId: "b", state: "waiting"}),
      ]),
    )
    await harness.update({
      taskId: harness.taskId,
      operationId: "resume-a",
      expectedRevision: current.revision,
      kind: "session_update",
      sessionId: "a",
      state: "working",
    })
    vi.setSystemTime(origin + 1_890_001)
    monotonic = 1_890_001
    current = await harness.getWorkflow()
    expect(current.sessions).toContainEqual(expect.objectContaining({sessionId: "a", connection: "uncertain"}))
    const longGap = await harness.update({
      taskId: harness.taskId,
      operationId: "long-gap",
      expectedRevision: current.revision,
      kind: "session_update",
      sessionId: "a",
      state: "working",
    })
    expect(longGap.confirmedSeconds).toBe(90)
    await harness.restart()
    current = await harness.getWorkflow()
    expect(current.sessions).toContainEqual(expect.objectContaining({sessionId: "a", state: "working", connection: "interrupted"}))
    const finished = await harness.update({
      taskId: harness.taskId,
      operationId: "finish-interrupted",
      expectedRevision: current.revision,
      kind: "session_update",
      sessionId: "a",
      state: "finished",
      summary: "Recovered after restart",
    })
    expect(finished.confirmedSeconds).toBe(90)
    expect((await harness.getWorkflow()).sessions).toContainEqual(expect.objectContaining({sessionId: "a", state: "finished"}))
    await harness.humanUpdate({spentTime: 50})
    expect((await harness.getWorkflow()).task.spentTime).toBe(50)
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
    humanUpdate(updates: Partial<Task>) {
      return humanWrite((storage) => storage.updateTask(taskId, updates))
    },
    humanResolve(request: TaskWorkflowResolution) {
      return humanWrite((storage) => storage.resolveTaskWorkflowProposal(request))
    },
    humanGuidance(scope: WorkflowGuidanceScope, content: string, allowCompletion: boolean | null) {
      return humanWrite(async (storage) => {
        const guidance = scope.kind === "project" ? await storage.getWorkflowGuidance(scope.projectId) : await storage.getWorkflowGuidance()
        const document = scope.kind === "workspace" ? guidance.workspace : guidance.project!
        return storage.updateWorkflowGuidance({
          scope,
          content,
          allowCompletion,
          operationId: `guidance-${document.history.length}`,
          expectedRevision: document.revision,
        })
      })
    },
    async initialize() {
      const response = await fetch(`${server.baseUrl}${AGENT_ENDPOINT_PATH}`, {
        method: "POST",
        headers: {authorization: `Bearer ${connected.accessToken}`, "content-type": "application/json"},
        body: JSON.stringify({jsonrpc: "2.0", id: ++requestId, method: "initialize", params: {protocolVersion: "2025-11-25"}}),
      })
      const result = (await response.json()) as {result: {instructions: string; workflowGuidance: {allowCompletion: boolean}}}
      return result.result
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

  async function humanWrite<T>(effect: (storage: WorkStorage) => Promise<T>): Promise<T> {
    const response = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {headers: {authorization: `Bearer ${parent.token}`}})
    expect(response.status).toBe(200)
    const read = (await response.json()) as {data: {snapshot: Snapshot; revision: string}}
    await mac.core.localAdapter.upsertDocs(normalizeSnapshotDocs(read.data.snapshot.docs))
    const storage = new WorkStorage(mac.core, mac.db, () => {})
    const result = await effect(storage)
    const write = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({expectedRevision: read.data.revision, snapshot: buildSnapshot(await mac.core.localAdapter.loadAllDocs())}),
    })
    expect(write.status).toBe(200)
    return result
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
