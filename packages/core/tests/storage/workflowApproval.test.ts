import {afterEach, expect, it} from "vitest"

import {WorkStorage} from "@core/storage/WorkStorage"
import {makeControllerHarness, makeTaskInput} from "../helpers/storageControllerHarness"

import type {TaskScheduled, TaskStatus, TaskWorkflowCommand, TaskWorkflowResolution} from "@daily/protocol"

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function makeApprovalHarness(scheduled: TaskScheduled | null = {date: "2030-01-01", time: "10:00", timezone: "UTC"}) {
  const core = makeControllerHarness()
  cleanups.push(() => core.db.close())
  let day: TaskScheduled = {date: "2030-02-02", time: "11:00", timezone: "UTC"}
  let observed = 10000
  const storage = new WorkStorage(core, core.db, () => {}, {
    runtimeId: "approval",
    now: () => observed,
    monotonicNow: () => observed,
    scheduledNow: () => day,
  })
  const task = core.taskModel.createTask(makeTaskInput({status: scheduled ? "in_progress" : "ready_for_agent", scheduled}))!
  return {
    ...core,
    storage,
    task,
    nextDay() {
      day = {date: "2030-03-03", time: "12:00", timezone: "UTC"}
    },
    observe(value: number) {
      observed = value
    },
    async run(action: object) {
      const state = await storage.getTaskWorkflow(task.id)
      return storage.executeTaskWorkflow(
        {taskId: task.id, operationId: String(state.records.length), expectedRevision: state.revision, ...action} as TaskWorkflowCommand,
        {actorId: "agent", source: {kind: "mcp"}},
      )
    },
    async decide(decision: "accepted" | "rejected") {
      const state = await storage.getTaskWorkflow(task.id)
      return storage.resolveTaskWorkflowProposal({
        taskId: task.id,
        proposalId: state.proposals[0].id,
        decision,
        operationId: "human",
        expectedRevision: state.revision,
      })
    },
  }
}

it("keeps a dated status transition pending until the exact status and cleared day are accepted", async () => {
  const core = makeApprovalHarness()
  await core.run({kind: "transition", status: "backlog"})
  expect(await core.storage.getTask(core.task.id)).toMatchObject({status: "in_progress", scheduled: core.task.scheduled})
  expect((await core.storage.getTaskWorkflow(core.task.id)).proposals).toEqual([
    expect.objectContaining({
      status: "pending",
      originalValues: {status: "in_progress", scheduled: core.task.scheduled, orderIndex: core.task.orderIndex},
      changes: {status: "backlog", scheduled: null, orderIndex: 1024},
    }),
  ])
  await core.decide("accepted")
  expect(await core.storage.getTask(core.task.id)).toMatchObject({status: "backlog", scheduled: null})
})

it("freezes an implicit first day when requesting a dated status and applies it only after approval", async () => {
  const core = makeApprovalHarness(null)
  await core.run({kind: "transition", status: "in_progress"})
  expect(await core.storage.getTask(core.task.id)).toMatchObject({status: "ready_for_agent", scheduled: null})
  const proposed = {date: "2030-02-02", time: "11:00", timezone: "UTC"}
  expect((await core.storage.getTaskWorkflow(core.task.id)).proposals[0]).toMatchObject({changes: {status: "in_progress", scheduled: proposed}})
  core.nextDay()
  await core.decide("accepted")
  expect(await core.storage.getTask(core.task.id)).toMatchObject({status: "in_progress", scheduled: proposed})
})

it("leaves status and schedule unchanged after rejecting a dependent date proposal", async () => {
  const core = makeApprovalHarness()
  await core.run({kind: "transition", status: "backlog"})
  expect((await core.storage.getTaskWorkflow(core.task.id)).proposals).toHaveLength(1)
  await core.decide("rejected")
  expect(await core.storage.getTask(core.task.id)).toMatchObject({status: "in_progress", scheduled: core.task.scheduled})
})

it("binds an explicit schedule clear to a visible backlog status effect", async () => {
  const core = makeApprovalHarness()
  await core.run({kind: "propose", changes: {scheduled: null}, reason: "No day is appropriate"})
  expect((await core.storage.getTaskWorkflow(core.task.id)).proposals[0]).toMatchObject({
    originalValues: {status: "in_progress", scheduled: core.task.scheduled},
    changes: {status: "backlog", scheduled: null},
  })
  await core.decide("accepted")
  expect(await core.storage.getTask(core.task.id)).toMatchObject({status: "backlog", scheduled: null})
})

it("changes a schedule preserving status automatically", async () => {
  const core = makeApprovalHarness()
  await core.run({kind: "transition", status: "ready_to_merge"})
  expect(await core.storage.getTask(core.task.id)).toMatchObject({status: "ready_to_merge", scheduled: core.task.scheduled})
  expect((await core.storage.getTaskWorkflow(core.task.id)).proposals).toHaveLength(0)
})

it("requires a fresh human revision after proposal values leave and return to their originals", async () => {
  const core = makeApprovalHarness()
  await core.run({kind: "propose", changes: {priority: "high"}, reason: "Review priority"})
  const pending = await core.storage.getTaskWorkflow(core.task.id)
  await core.storage.updateTask(core.task.id, {priority: "low"})
  await core.storage.updateTask(core.task.id, {priority: "none"})
  await expect(
    core.storage.resolveTaskWorkflowProposal({
      taskId: core.task.id,
      proposalId: pending.proposals[0].id,
      decision: "accepted",
      operationId: "stale-human",
      expectedRevision: pending.revision,
    }),
  ).rejects.toMatchObject({code: "stale_revision"})
  expect((await core.storage.getTask(core.task.id))?.priority).toBe("none")
  await core.decide("accepted")
  expect((await core.storage.getTask(core.task.id))?.priority).toBe("high")
})

it("refuses an accepted proposal whose proposed milestone was deleted during review", async () => {
  const core = makeApprovalHarness()
  const milestone = core.milestoneModel.createMilestone({
    branchId: "main",
    name: "Review milestone",
    description: "",
    targetDate: null,
    orderIndex: 1,
  })!
  await core.run({kind: "propose", changes: {milestoneId: milestone.id, priority: "high"}, reason: "Plan together"})
  core.milestoneModel.deleteMilestone(milestone.id)
  const before = await core.storage.getTask(core.task.id)
  await expect(core.decide("accepted")).rejects.toMatchObject({code: "conflict"})
  expect(await core.storage.getTask(core.task.id)).toEqual(before)
  expect((await core.storage.getTaskWorkflow(core.task.id)).proposals[0].status).toBe("pending")
})

it("settles connected observed work during trusted acceptance and keeps the exact decision retryable", async () => {
  const core = makeApprovalHarness()
  await core.run({kind: "session_start", sessionId: "during-review"})
  await core.run({kind: "propose", changes: {priority: "high"}, reason: "Review while working"})
  core.observe(20000)
  const pending = await core.storage.getTaskWorkflow(core.task.id)
  const request: TaskWorkflowResolution = {
    taskId: core.task.id,
    proposalId: pending.proposals[0].id,
    decision: "accepted",
    operationId: "accept-during-work",
    expectedRevision: pending.revision,
  }
  const receipt = await core.storage.resolveTaskWorkflowProposal(request)
  expect(await core.storage.resolveTaskWorkflowProposal(request)).toEqual(receipt)
  expect((await core.storage.getTaskWorkflow(core.task.id)).revision).toBe(receipt.revision)
  await core.run({kind: "session_update", sessionId: "during-review", state: "waiting"})
  expect(await core.storage.getTaskWorkflow(core.task.id)).toMatchObject({confirmedSeconds: 10, task: {spentTime: 10, priority: "high"}})
})

it("does not apply an older proposal to a deleted task without an explicit reviewed restoration", async () => {
  const core = makeApprovalHarness()
  await core.run({kind: "propose", changes: {priority: "high"}, reason: "Review before deletion"})
  await core.storage.deleteTask(core.task.id)
  await expect(core.decide("accepted")).rejects.toMatchObject({code: "not_found"})
  expect(await core.storage.getTask(core.task.id)).toMatchObject({priority: "none", deletedAt: expect.any(String)})
})

it("keeps planning corrections to already resolved tasks available for trusted review without completion permission", async () => {
  const statuses: TaskStatus[] = ["done", "cancelled"]
  for (const status of statuses) {
    const core = makeApprovalHarness()
    await core.storage.updateTask(core.task.id, {status})
    expect((await core.storage.getWorkflowGuidance("main")).allowCompletion).toBe(false)
    await expect(
      core.run({kind: "propose", changes: {priority: "high", estimatedTime: 600}, reason: "Correct planning values"}),
    ).resolves.toMatchObject({outcome: "proposal_pending"})
    expect(await core.storage.getTask(core.task.id)).toMatchObject({status, priority: "none", estimatedTime: 0})
    await core.decide("accepted")
    expect(await core.storage.getTask(core.task.id)).toMatchObject({status, priority: "high", estimatedTime: 600})
  }
})

it("still requires completion permission when a proposal explicitly requests a terminal status", async () => {
  const statuses: TaskStatus[] = ["done", "cancelled"]
  for (const status of statuses) {
    const core = makeApprovalHarness()
    await core.storage.updateTask(core.task.id, {status})
    await expect(core.run({kind: "propose", changes: {status, priority: "high"}, reason: "Explicit terminal request"})).rejects.toMatchObject({
      code: "forbidden",
    })
    expect((await core.storage.getTaskWorkflow(core.task.id)).proposals).toHaveLength(0)
    expect(await core.storage.getTask(core.task.id)).toMatchObject({status, priority: "none"})
  }
})

it("requires destination completion permission when a proposal moves a terminal task to another project", async () => {
  const core = makeApprovalHarness()
  const project = core.branchModel.createBranch({name: "Destination"})!
  await core.storage.updateTask(core.task.id, {status: "done"})
  const action = {kind: "propose", changes: {branchId: project.id, priority: "high"}, reason: "Move completed work"}
  await expect(core.run(action)).rejects.toMatchObject({code: "forbidden"})
  expect(await core.storage.getTask(core.task.id)).toMatchObject({branchId: "main", status: "done", priority: "none"})
  const guidance = await core.storage.getWorkflowGuidance(project.id)
  await core.storage.updateWorkflowGuidance({
    scope: {kind: "project", projectId: project.id},
    content: guidance.project!.content,
    allowCompletion: true,
    operationId: "allow-destination-completion",
    expectedRevision: guidance.project!.revision,
  })
  await expect(core.run(action)).resolves.toMatchObject({outcome: "proposal_pending"})
  expect(await core.storage.getTask(core.task.id)).toMatchObject({branchId: "main", status: "done", priority: "none"})
  await core.decide("accepted")
  expect(await core.storage.getTask(core.task.id)).toMatchObject({branchId: project.id, status: "done", priority: "high"})
})
