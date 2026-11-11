import {describe, expect, it, vi} from "vitest"

import {getTaskTool} from "../src/read/getTask"
import {deleteCommentTool} from "../src/write/deleteComment"
import {saveCommentTool} from "../src/write/saveComment"
import {saveTaskTool} from "../src/write/saveTask"
import {updateTaskWorkflowTool} from "../src/write/updateTaskWorkflow"
import {makeRealWorkspace} from "./helpers/realWorkspace"

import type {ActorSource} from "@daily/protocol"

describe("shared task workflow", () => {
  it("proposes a scheduled day without requiring an invented time", async () => {
    const {db, ctx} = makeRealWorkspace()
    const {task} = (await saveTaskTool.run({content: "Selected task"}, ctx)) as {task: {id: string}}
    const state = await ctx.workStorage.getTaskWorkflow(task.id)
    await updateTaskWorkflowTool.run(
      {
        taskId: task.id,
        operationId: "date-only",
        expectedRevision: state.revision,
        kind: "propose",
        changes: {scheduled: {date: "2026-11-12", time: "", timezone: "UTC"}},
        reason: "Work on the selected day",
      },
      ctx,
    )
    const pending = await ctx.workStorage.getTaskWorkflow(task.id)
    expect(pending.proposals).toContainEqual(expect.objectContaining({changes: {scheduled: {date: "2026-11-12", time: "", timezone: "UTC"}}}))
    expect(pending.task.scheduled).toBeNull()
    db.close()
  })
  it("get_task exposes the observed workflow revision and pending planning summary", async () => {
    const {db, ctx} = makeRealWorkspace()
    const {task} = (await saveTaskTool.run({content: "Selected task"}, ctx)) as {task: {id: string}}
    const state = await ctx.workStorage.getTaskWorkflow(task.id)
    expect(await getTaskTool.run({id: task.id}, ctx)).toMatchObject({
      workflow: {taskId: task.id, revision: state.revision, confirmedSeconds: 0, proposals: []},
    })
    db.close()
  })
  it("creates unscheduled backlog work without granting planning values or execution", async () => {
    const {db, ctx} = makeRealWorkspace()
    const result = await saveTaskTool.run({content: "New task"}, ctx)
    expect(result).toMatchObject({task: {status: "backlog", scheduled: null, priority: "none", estimatedSeconds: 0, spentSeconds: 0}})
    db.close()
  })
  it("refuses legacy protected edits with guidance before saving any content", async () => {
    const {db, ctx} = makeRealWorkspace()
    const {task} = (await saveTaskTool.run({content: "Selected task"}, ctx)) as {task: {id: string}}
    await expect(saveTaskTool.run({id: task.id, content: "Changed", priority: "urgent"}, ctx)).rejects.toMatchObject({
      code: "WORKFLOW_REQUIRED",
      message: expect.stringContaining("update_task_workflow"),
    })
    expect((await ctx.workStorage.getTask(task.id))?.content).toBe("Selected task")
    db.close()
  })
  it("returns authoritative task fields and revision from one observation during a concurrent human edit", async () => {
    const {db, ctx} = makeRealWorkspace()
    try {
      const {task} = (await saveTaskTool.run({content: "Before human correction"}, ctx)) as {task: {id: string}}
      await ctx.workStorage.updateTask(task.id, {scheduled: {date: "2026-11-12", time: "12:00:00", timezone: "UTC"}})
      let enter!: () => void
      let release!: () => void
      const entered = new Promise<void>((resolve) => {
        enter = resolve
      })
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const original = ctx.workStorage.getCommentsOfTask.bind(ctx.workStorage)
      vi.spyOn(ctx.workStorage, "getCommentsOfTask").mockImplementationOnce(async (id) => {
        enter()
        await gate
        return original(id)
      })
      const reading = getTaskTool.run({id: task.id}, ctx)
      await entered
      await ctx.workStorage.updateTask(task.id, {content: "After human correction", priority: "urgent", estimatedTime: 120})
      release()
      const detail = (await reading) as {content: string; workflow: {revision: string}}
      expect(detail).toMatchObject({content: "Before human correction", priority: "none", estimatedSeconds: 0})
      await expect(
        updateTaskWorkflowTool.run(
          {taskId: task.id, operationId: "coherent-read", expectedRevision: detail.workflow.revision, kind: "transition", stage: "implementation"},
          ctx,
        ),
      ).rejects.toMatchObject({code: "stale_revision", current: {task: {content: "After human correction"}}})
    } finally {
      vi.restoreAllMocks()
      db.close()
    }
  })

  it("blocks every agent's update and delete of a ledger-bound proposal at storage", async () => {
    const {db, ctx, workStorage, changesets} = makeRealWorkspace({kind: "mcp", provider: "Proposing agent"})
    try {
      const {task} = (await saveTaskTool.run({content: "Selected work"}, ctx)) as {task: {id: string}}
      const before = await workStorage.getTaskWorkflow(task.id)
      await updateTaskWorkflowTool.run(
        {
          taskId: task.id,
          operationId: "visible-proposal",
          expectedRevision: before.revision,
          kind: "propose",
          changes: {priority: "urgent"},
          reason: "Requires human review",
        },
        ctx,
      )
      const [comment] = await workStorage.getCommentsOfTask(task.id)
      const unchanged = changesets.length
      const agents: ActorSource[] = [
        {kind: "agent", provider: "daily_agent"},
        {kind: "mcp", provider: "Different agent"},
      ]
      for (const source of agents) {
        const other = {...ctx, source, workflowActorId: "different-agent"}
        await expect(saveCommentTool.run({id: comment.id, content: "Hidden", source: {kind: "manual"}}, other)).rejects.toMatchObject({
          code: "forbidden",
        })
        await expect(deleteCommentTool.run({id: comment.id, source: {kind: "manual"}}, other)).rejects.toMatchObject({code: "forbidden"})
        await expect(workStorage.updateComment(comment.id, "Hidden", source)).rejects.toMatchObject({code: "forbidden"})
        await expect(workStorage.deleteComment(comment.id, source)).rejects.toMatchObject({code: "forbidden"})
      }
      expect(changesets).toHaveLength(unchanged)
      expect(await workStorage.getCommentsOfTask(task.id)).toEqual([comment])
      expect((await workStorage.getTaskWorkflow(task.id)).proposals).toEqual([
        expect.objectContaining({status: "pending", reason: "Requires human review"}),
      ])
    } finally {
      db.close()
    }
  })

  it("allows ordinary agent comment edits and deliberate human proposal edits without changing the ledger", async () => {
    const {db, ctx, workStorage} = makeRealWorkspace({kind: "mcp", provider: "Approved agent"})
    try {
      const {task} = (await saveTaskTool.run({content: "Selected work"}, ctx)) as {task: {id: string}}
      const before = await workStorage.getTaskWorkflow(task.id)
      await updateTaskWorkflowTool.run(
        {
          taskId: task.id,
          operationId: "human-review",
          expectedRevision: before.revision,
          kind: "propose",
          changes: {priority: "urgent"},
          reason: "Requires human review",
        },
        ctx,
      )
      const [proposal] = await workStorage.getCommentsOfTask(task.id)
      const {comment} = (await saveCommentTool.run({taskId: task.id, content: proposal.content}, ctx)) as {comment: {id: string}}
      await saveCommentTool.run({id: comment.id, content: "Ordinary corrected note"}, ctx)
      expect(await workStorage.getCommentsOfTask(task.id)).toContainEqual(
        expect.objectContaining({id: comment.id, content: "Ordinary corrected note"}),
      )
      await deleteCommentTool.run({id: comment.id}, ctx)
      const pending = await workStorage.getTaskWorkflow(task.id)
      await workStorage.updateComment(proposal.id, "Human clarification")
      expect(await workStorage.getCommentsOfTask(task.id)).toEqual([expect.objectContaining({id: proposal.id, content: "Human clarification"})])
      await expect(saveCommentTool.run({id: proposal.id, content: "Agent replacement"}, ctx)).rejects.toMatchObject({code: "forbidden"})
      await expect(deleteCommentTool.run({id: proposal.id}, ctx)).rejects.toMatchObject({code: "forbidden"})
      await workStorage.deleteComment(proposal.id, {kind: "manual"})
      expect(await workStorage.getCommentsOfTask(task.id)).toEqual([])
      expect(await workStorage.getTaskWorkflow(task.id)).toEqual(pending)
    } finally {
      db.close()
    }
  })
})
