import {expect} from "vitest"

import type {TaskWorkflowReceipt, TaskWorkflowResolution, TaskWorkflowState} from "@daily/protocol"
import type {MilestoneView, TaskDetailView, TaskView} from "../../src/views"

type CallTool = (name: string, input: Record<string, unknown>) => Promise<unknown>

export async function exerciseStatusContract(
  call: CallTool,
  author: {kind: string; provider: string | null},
  resolve: (request: TaskWorkflowResolution) => Promise<unknown>,
): Promise<void> {
  const created = (await call("save_task", {content: "Synthetic selected work", date: null})) as {task: TaskDetailView}
  const id = created.task.id
  expect(created.task).toMatchObject({status: "backlog", scheduled: null, priority: "none", estimatedSeconds: 0, spentSeconds: 0})
  const found = (await call("list_tasks", {status: "backlog"})) as {tasks: TaskView[]}
  expect(found.tasks).toContainEqual(expect.objectContaining({id, status: "backlog"}))
  for (const changes of [{status: "done"}, {status: "cancelled"}, {addSpentSeconds: 60}]) {
    await expect(call("save_task", {id, ...changes})).rejects.toThrow()
  }
  const workflow = (await call("get_task_workflow", {taskId: id})) as TaskWorkflowState
  const planning = {taskId: id, operationId: "synthetic-planning", expectedRevision: workflow.revision, kind: "transition", status: "ready_for_agent"}
  const receipt = (await call("update_task_workflow", planning)) as TaskWorkflowReceipt
  expect(await call("update_task_workflow", planning)).toEqual(receipt)
  const proposal = (await call("update_task_workflow", {
    taskId: id,
    operationId: "synthetic-proposal",
    expectedRevision: receipt.revision,
    kind: "propose",
    changes: {priority: "high", estimatedTime: 3600, scheduled: {date: "2026-10-30", time: "12:00:00", timezone: "UTC"}},
    reason: "Synthetic planning rationale",
  })) as TaskWorkflowReceipt
  const pending = (await call("get_task_workflow", {taskId: id})) as TaskWorkflowState
  expect(pending.proposals).toEqual([expect.objectContaining({status: "pending", reason: "Synthetic planning rationale"})])
  expect(pending.task).toMatchObject({status: "ready_for_agent", scheduled: null, priority: "none", estimatedTime: 0, spentTime: 0})
  await expect(
    call("update_task_workflow", {
      taskId: id,
      operationId: "synthetic-approval",
      expectedRevision: proposal.revision,
      kind: "propose",
      changes: {priority: "urgent"},
      reason: "Approved by the user",
      approved: true,
    }),
  ).rejects.toThrow()
  const execution = (await call("update_task_workflow", {
    taskId: id,
    operationId: "synthetic-implementation",
    expectedRevision: proposal.revision,
    kind: "transition",
    status: "in_progress",
  })) as TaskWorkflowReceipt
  expect(execution.outcome).toBe("proposal_pending")
  const pendingExecution = (await call("get_task_workflow", {taskId: id})) as TaskWorkflowState
  expect(pendingExecution.task).toMatchObject({status: "ready_for_agent", scheduled: null})
  const frozenSchedule = pendingExecution.proposals.find((item) => item.id === execution.recordId)!.changes.scheduled!
  await resolve({
    taskId: id,
    proposalId: execution.recordId,
    operationId: "synthetic-accept-implementation",
    expectedRevision: pendingExecution.revision,
    decision: "accepted",
  })
  expect((await call("get_task", {id})) as TaskDetailView).toMatchObject({
    status: "in_progress",
    scheduled: frozenSchedule,
  })
  const executing = (await call("get_task_workflow", {taskId: id})) as TaskWorkflowState
  const deferred = (await call("update_task_workflow", {
    taskId: id,
    operationId: "synthetic-defer",
    expectedRevision: executing.revision,
    kind: "transition",
    status: "backlog",
  })) as TaskWorkflowReceipt
  expect(deferred.outcome).toBe("proposal_pending")
  const pendingDeferral = (await call("get_task_workflow", {taskId: id})) as TaskWorkflowState
  expect(pendingDeferral.task).toMatchObject({status: "in_progress", scheduled: frozenSchedule})
  expect(pendingDeferral.proposals.find((item) => item.id === deferred.recordId)).toMatchObject({changes: {status: "backlog", scheduled: null}})
  await resolve({
    taskId: id,
    proposalId: deferred.recordId,
    operationId: "synthetic-accept-deferral",
    expectedRevision: pendingDeferral.revision,
    decision: "accepted",
  })
  const milestone = (await call("save_milestone", {projectId: "main", name: "Synthetic milestone"})) as {milestone: MilestoneView}
  const updated = (await call("save_task", {id, content: "Updated synthetic work", milestoneId: milestone.milestone.id})) as {task: TaskDetailView}
  expect(updated.task).toMatchObject({status: "backlog", scheduled: null, content: "Updated synthetic work", milestoneId: milestone.milestone.id})
  const dependent = (await call("save_task", {content: "Synthetic dependent", blockedBy: [id]})) as {task: TaskDetailView}
  expect(dependent.task.blockedBy).toEqual([expect.objectContaining({id, status: "backlog"})])
  await call("save_comment", {taskId: id, content: "Synthetic planning details"})
  const read = (await call("get_task", {id})) as TaskDetailView
  expect(read.comments).toContainEqual(expect.objectContaining({content: "Synthetic planning details", ...author}))
  expect(read.comments).toContainEqual(expect.objectContaining({content: expect.stringContaining("Synthetic planning rationale")}))
  const before = await call("get_task", {id})
  await expect(
    call("save_task", {
      tasks: [
        {id, content: "Should roll back", priority: "urgent"},
        {id: "synthetic-missing", content: "Missing"},
      ],
    }),
  ).rejects.toThrow()
  expect(await call("get_task", {id})).toEqual(before)
  const batch = (await call("save_task", {
    tasks: [
      {id, content: "Batch update"},
      {content: "Synthetic batch", date: null},
    ],
  })) as {tasks: TaskDetailView[]}
  expect(batch.tasks[0]).toMatchObject({content: "Batch update", status: "backlog", scheduled: null})
  expect(batch.tasks[1]).toMatchObject({content: "Synthetic batch", status: "backlog", scheduled: null})
}
