import {performance} from "node:perf_hooks"
import {expect, it} from "vitest"

import {WorkStorage} from "@daily/core/storage/WorkStorage"

import {deleteCommentTool} from "../src/write/deleteComment"
import {saveCommentTool} from "../src/write/saveComment"
import {saveTaskTool} from "../src/write/saveTask"
import {updateTaskWorkflowTool} from "../src/write/updateTaskWorkflow"
import {makeRealWorkspace} from "./helpers/realWorkspace"

import type {ActorSource} from "@daily/protocol"

it.each([
  {kind: "propose", mutation: "rewrite"},
  {kind: "propose", mutation: "delete"},
  {kind: "transition", mutation: "rewrite"},
  {kind: "transition", mutation: "delete"},
])("rejects an agent's $mutation of the comment linked to a $kind planning proposal", async ({kind, mutation}) => {
  const {db, ctx, changesets} = makeRealWorkspace({kind: "mcp", provider: "Proposing agent"})
  try {
    const {task} = (await saveTaskTool.run({content: "Dated work", status: "in_progress", date: "2030-01-01"}, ctx)) as {task: {id: string}}
    const before = await ctx.workStorage.getTaskWorkflow(task.id)
    const command = kind === "propose" ? {kind, changes: {priority: "high"}, reason: "Requires human review"} : {kind, status: "backlog"}
    await expect(
      updateTaskWorkflowTool.run({taskId: task.id, operationId: "review", expectedRevision: before.revision, ...command}, ctx),
    ).resolves.toMatchObject({outcome: "proposal_pending"})
    const pending = await ctx.workStorage.getTaskWorkflow(task.id)
    const [comment] = await ctx.workStorage.getCommentsOfTask(task.id)
    expect(pending.proposals).toEqual([expect.objectContaining({commentId: comment.id, status: "pending"})])
    const unchanged = changesets.length
    const agents: ActorSource[] = [{kind: "agent"}, {kind: "mcp", provider: "Different agent"}]
    for (const source of agents) {
      const other = {...ctx, source, workflowActorId: "different-agent"}
      const result =
        mutation === "rewrite"
          ? saveCommentTool.run({id: comment.id, content: "Forged presentation"}, other)
          : deleteCommentTool.run({id: comment.id}, other)
      await expect(result).rejects.toMatchObject({code: "forbidden"})
    }
    expect(changesets).toHaveLength(unchanged)
    expect(await ctx.workStorage.getCommentsOfTask(task.id)).toEqual([comment])
    expect(await ctx.workStorage.getTaskWorkflow(task.id)).toEqual(pending)
  } finally {
    db.close()
  }
})

it("preserves human transition proposal edits and ordinary agent comment edits without changing the ledger", async () => {
  const {db, ctx} = makeRealWorkspace({kind: "mcp", provider: "Proposing agent"})
  try {
    const {task} = (await saveTaskTool.run({content: "Dated work", status: "in_progress", date: "2030-01-01"}, ctx)) as {task: {id: string}}
    const before = await ctx.workStorage.getTaskWorkflow(task.id)
    await updateTaskWorkflowTool.run(
      {taskId: task.id, operationId: "review", expectedRevision: before.revision, kind: "transition", status: "backlog"},
      ctx,
    )
    const pending = await ctx.workStorage.getTaskWorkflow(task.id)
    const [proposal] = await ctx.workStorage.getCommentsOfTask(task.id)
    const {comment} = (await saveCommentTool.run({taskId: task.id, content: proposal.content}, ctx)) as {comment: {id: string}}
    await saveCommentTool.run({id: comment.id, content: "Ordinary corrected note"}, ctx)
    expect(await ctx.workStorage.getCommentsOfTask(task.id)).toContainEqual(
      expect.objectContaining({id: comment.id, content: "Ordinary corrected note"}),
    )
    await deleteCommentTool.run({id: comment.id}, ctx)
    await ctx.workStorage.updateComment(proposal.id, "Human clarification")
    expect(await ctx.workStorage.getCommentsOfTask(task.id)).toEqual([expect.objectContaining({id: proposal.id, content: "Human clarification"})])
    await ctx.workStorage.deleteComment(proposal.id, {kind: "manual"})
    expect(await ctx.workStorage.getCommentsOfTask(task.id)).toEqual([])
    expect(await ctx.workStorage.getTaskWorkflow(task.id)).toEqual(pending)
  } finally {
    db.close()
  }
})

it("preserves real host observed working time through a proposal-only save_task", async () => {
  const {core, db, ctx} = makeRealWorkspace()
  ctx.workStorage = new WorkStorage(core, db, () => {}, {runtimeId: "real-clocks", now: Date.now, monotonicNow: () => performance.now()})
  try {
    const {task} = (await saveTaskTool.run({content: "Observe work"}, ctx)) as {task: {id: string}}
    let state = await ctx.workStorage.getTaskWorkflow(task.id)
    await ctx.workStorage.executeTaskWorkflow(
      {taskId: task.id, operationId: "start", expectedRevision: state.revision, kind: "session_start", sessionId: "real"},
      {actorId: ctx.workflowActorId, source: ctx.source},
    )
    await new Promise((resolve) => setTimeout(resolve, 1100))
    await expect(saveTaskTool.run({id: task.id, priority: "high"}, ctx)).resolves.toMatchObject({outcome: "proposal_pending"})
    state = await ctx.workStorage.getTaskWorkflow(task.id)
    await ctx.workStorage.executeTaskWorkflow(
      {taskId: task.id, operationId: "wait", expectedRevision: state.revision, kind: "session_update", sessionId: "real", state: "waiting"},
      {actorId: ctx.workflowActorId, source: ctx.source},
    )
    state = await ctx.workStorage.getTaskWorkflow(task.id)
    expect(state.confirmedSeconds).toBeGreaterThanOrEqual(1)
    expect(state.task.spentTime).toBeGreaterThanOrEqual(1)
  } finally {
    db.close()
  }
})

it("keeps mixed legacy content, status and planning changes together for exact human review", async () => {
  const {db, ctx} = makeRealWorkspace()
  try {
    const {task} = (await saveTaskTool.run({content: "Original", status: "in_progress", date: "2030-01-01"}, ctx)) as {task: {id: string}}
    await expect(saveTaskTool.run({id: task.id, content: "Revised", status: "backlog", priority: "high"}, ctx)).resolves.toMatchObject({
      outcome: "proposal_pending",
      task: {content: "Original", status: "in_progress", scheduled: {date: "2030-01-01"}, priority: "none"},
      proposals: [
        expect.objectContaining({changes: expect.objectContaining({content: "Revised", status: "backlog", scheduled: null, priority: "high"})}),
      ],
    })
    const pending = await ctx.workStorage.getTaskWorkflow(task.id)
    await ctx.workStorage.resolveTaskWorkflowProposal({
      taskId: task.id,
      proposalId: pending.proposals[0].id,
      decision: "accepted",
      operationId: "accept",
      expectedRevision: pending.revision,
    })
    expect(await ctx.workStorage.getTask(task.id)).toMatchObject({content: "Revised", status: "backlog", scheduled: null, priority: "high"})
  } finally {
    db.close()
  }
})

it("settles active session time before an actual legacy content change invalidates the checkpoint", async () => {
  const {core, db, ctx} = makeRealWorkspace()
  let now = 0
  ctx.workStorage = new WorkStorage(core, db, () => {}, {runtimeId: "content", now: () => now, monotonicNow: () => now})
  try {
    const {task} = (await saveTaskTool.run({content: "Original"}, ctx)) as {task: {id: string}}
    let state = await ctx.workStorage.getTaskWorkflow(task.id)
    await ctx.workStorage.executeTaskWorkflow(
      {taskId: task.id, operationId: "start", expectedRevision: state.revision, kind: "session_start", sessionId: "content"},
      {actorId: ctx.workflowActorId, source: ctx.source},
    )
    now = 600000
    await saveTaskTool.run({id: task.id, content: "Revised"}, ctx)
    state = await ctx.workStorage.getTaskWorkflow(task.id)
    expect(state.task).toMatchObject({content: "Revised", spentTime: 600})
    expect(state.confirmedSeconds).toBe(600)
  } finally {
    db.close()
  }
})

it("uses the same pending date guard for the legacy implementation alias", async () => {
  const {db, ctx} = makeRealWorkspace()
  try {
    const {task} = (await saveTaskTool.run({content: "Unscheduled", status: "ready_for_agent", date: null}, ctx)) as {task: {id: string}}
    const state = await ctx.workStorage.getTaskWorkflow(task.id)
    await expect(
      updateTaskWorkflowTool.run(
        {taskId: task.id, operationId: "alias", expectedRevision: state.revision, kind: "transition", stage: "implementation"},
        ctx,
      ),
    ).resolves.toMatchObject({outcome: "proposal_pending", proposal: {changes: {status: "in_progress", scheduled: {date: expect.any(String)}}}})
    expect(await ctx.workStorage.getTask(task.id)).toMatchObject({status: "ready_for_agent", scheduled: null})
  } finally {
    db.close()
  }
})

it("rejects an incompatible explicit status and schedule clear without creating a misleading proposal", async () => {
  const {db, ctx} = makeRealWorkspace()
  try {
    const {task} = (await saveTaskTool.run({content: "Dated", status: "in_progress"}, ctx)) as {task: {id: string}}
    const before = await ctx.workStorage.getTaskWorkflow(task.id)
    await expect(saveTaskTool.run({id: task.id, content: "Must roll back", status: "in_progress", date: null}, ctx)).rejects.toMatchObject({
      code: "invalid_request",
    })
    expect(await ctx.workStorage.getTaskWorkflow(task.id)).toEqual(before)
    await expect(
      updateTaskWorkflowTool.run(
        {
          taskId: task.id,
          operationId: "bad-clear",
          expectedRevision: before.revision,
          kind: "propose",
          changes: {status: "in_progress", scheduled: null},
          reason: "Incompatible",
        },
        ctx,
      ),
    ).rejects.toMatchObject({code: "invalid_request"})
    expect(await ctx.workStorage.getTaskWorkflow(task.id)).toEqual(before)
  } finally {
    db.close()
  }
})

it("keeps a batch of date changing statuses pending and rolls the entire batch back on an incompatible clear", async () => {
  const {db, ctx} = makeRealWorkspace()
  try {
    const {task: first} = (await saveTaskTool.run({content: "First", status: "in_progress"}, ctx)) as {task: {id: string}}
    const {task: second} = (await saveTaskTool.run({content: "Second", status: "in_progress"}, ctx)) as {task: {id: string}}
    await expect(
      saveTaskTool.run(
        {
          tasks: [
            {id: first.id, status: "backlog"},
            {id: second.id, status: "in_progress", date: null},
          ],
        },
        ctx,
      ),
    ).rejects.toMatchObject({code: "invalid_request"})
    expect((await ctx.workStorage.getTaskWorkflow(first.id)).proposals).toHaveLength(0)
    await expect(
      saveTaskTool.run(
        {
          tasks: [
            {id: first.id, status: "backlog"},
            {id: second.id, status: "backlog"},
          ],
        },
        ctx,
      ),
    ).resolves.toMatchObject({
      outcome: "proposal_pending",
      proposals: [
        expect.objectContaining({changes: expect.objectContaining({status: "backlog", scheduled: null})}),
        expect.objectContaining({changes: expect.objectContaining({status: "backlog", scheduled: null})}),
      ],
    })
    for (const task of [first, second])
      expect(await ctx.workStorage.getTask(task.id)).toMatchObject({status: "in_progress", scheduled: expect.any(Object)})
  } finally {
    db.close()
  }
})

it("applies an approved project move with its comments, tag cleanup and invalid relation cleanup", async () => {
  const {db, ctx} = makeRealWorkspace()
  try {
    const target = (await ctx.workStorage.createBranch({name: "Target"})).branches!.upserted![0]
    const {task} = (await saveTaskTool.run({content: "Moving", status: "in_progress"}, ctx)) as {task: {id: string}}
    const {task: dependency} = (await saveTaskTool.run({content: "Dependency"}, ctx)) as {task: {id: string}}
    await ctx.workStorage.createComment(task.id, "Keep with the task")
    await ctx.workStorage.setTaskRelations(task.id, {blockedBy: [dependency.id], blocks: []})
    await expect(saveTaskTool.run({id: task.id, projectId: target.id, status: "backlog", content: "Moved"}, ctx)).resolves.toMatchObject({
      outcome: "proposal_pending",
      task: {projectId: "main", content: "Moving", status: "in_progress"},
    })
    const state = await ctx.workStorage.getTaskWorkflow(task.id)
    await ctx.workStorage.resolveTaskWorkflowProposal({
      taskId: task.id,
      proposalId: state.proposals[0].id,
      operationId: "accept-move",
      expectedRevision: state.revision,
      decision: "accepted",
    })
    expect(await ctx.workStorage.getTask(task.id)).toMatchObject({
      branchId: target.id,
      content: "Moved",
      status: "backlog",
      scheduled: null,
      tags: [],
      milestoneId: null,
    })
    expect(await ctx.workStorage.getCommentsOfTask(task.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({branchId: target.id, content: "Keep with the task"})]),
    )
    expect(await ctx.workStorage.getRelationsOfTask(task.id)).toEqual({blockedBy: [], blocks: []})
  } finally {
    db.close()
  }
})

it("rejects mixed restoration and planning atomically, then permits ordinary restore followed by accessible review", async () => {
  const {db, ctx} = makeRealWorkspace()
  try {
    const {task} = (await saveTaskTool.run({content: "Archived", status: "in_progress"}, ctx)) as {task: {id: string}}
    await ctx.workStorage.deleteTask(task.id)
    const deleted = await ctx.workStorage.getTaskWorkflow(task.id)
    await expect(saveTaskTool.run({id: task.id, deleted: false, content: "Restored", status: "backlog"}, ctx)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    })
    expect(await ctx.workStorage.getTaskWorkflow(task.id)).toEqual(deleted)
    await expect(saveTaskTool.run({id: task.id, deleted: false}, ctx)).resolves.toMatchObject({
      task: {content: "Archived", status: "in_progress", scheduled: deleted.task.scheduled, deletedAt: null},
    })
    await expect(saveTaskTool.run({id: task.id, content: "Restored", status: "backlog"}, ctx)).resolves.toMatchObject({
      outcome: "proposal_pending",
      task: {content: "Archived", status: "in_progress", deletedAt: null},
      proposals: [expect.objectContaining({changes: expect.objectContaining({content: "Restored", status: "backlog", scheduled: null})})],
    })
    const state = await ctx.workStorage.getTaskWorkflow(task.id)
    await ctx.workStorage.resolveTaskWorkflowProposal({
      taskId: task.id,
      proposalId: state.proposals[0].id,
      operationId: "accept-restore",
      expectedRevision: state.revision,
      decision: "accepted",
    })
    expect(await ctx.workStorage.getTask(task.id)).toMatchObject({content: "Restored", status: "backlog", scheduled: null, deletedAt: null})
  } finally {
    db.close()
  }
})

it("rejects relative reordering mixed into a pending proposal before applying content or status", async () => {
  const {db, ctx} = makeRealWorkspace()
  try {
    const {task} = (await saveTaskTool.run({content: "Original", status: "in_progress"}, ctx)) as {task: {id: string}}
    const state = await ctx.workStorage.getTaskWorkflow(task.id)
    await expect(saveTaskTool.run({id: task.id, content: "Hidden", priority: "high", beforeTaskId: "another"}, ctx)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    })
    expect(await ctx.workStorage.getTaskWorkflow(task.id)).toEqual(state)
  } finally {
    db.close()
  }
})

it("distinguishes an original pending operation receipt from the current accepted review on retry", async () => {
  const {db, ctx} = makeRealWorkspace()
  try {
    const {task} = (await saveTaskTool.run({content: "Undated", date: null}, ctx)) as {task: {id: string}}
    const before = await ctx.workStorage.getTaskWorkflow(task.id)
    const command = {taskId: task.id, operationId: "retry-status", expectedRevision: before.revision, kind: "transition", status: "in_progress"}
    const original = (await updateTaskWorkflowTool.run(command, ctx)) as {recordId: string; revision: string}
    const pending = await ctx.workStorage.getTaskWorkflow(task.id)
    await ctx.workStorage.resolveTaskWorkflowProposal({
      taskId: task.id,
      proposalId: original.recordId,
      operationId: "accept-retry",
      expectedRevision: pending.revision,
      decision: "accepted",
    })
    await expect(updateTaskWorkflowTool.run(command, ctx)).resolves.toMatchObject({
      recordId: original.recordId,
      revision: original.revision,
      outcome: "proposal_pending",
      reviewStatus: "accepted",
      proposal: {status: "accepted"},
    })
    expect(await ctx.workStorage.getTask(task.id)).toMatchObject({status: "in_progress", scheduled: expect.any(Object)})
  } finally {
    db.close()
  }
})
