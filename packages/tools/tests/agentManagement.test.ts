import {expect, it} from "vitest"

import {findTool} from "../src"
import {makeRealWorkspace} from "./helpers/realWorkspace"

it("save_task preserves explicitly requested initial planning fields and the caller-day default", async () => {
  const {ctx, db} = makeRealWorkspace()
  try {
    await expect(
      findTool("save_task")!.run({content: "Prepare interview", date: "2026-04-10", time: "14:30", priority: "high", estimatedSeconds: 1800}, ctx),
    ).resolves.toMatchObject({
      task: {status: "todo", scheduled: {date: "2026-04-10", time: "14:30:00", timezone: "UTC"}, priority: "high", estimatedSeconds: 1800},
    })
    await expect(findTool("save_task")!.run({content: "Read the brief"}, ctx)).resolves.toMatchObject({
      task: {status: "todo", scheduled: {date: "2026-03-24"}},
    })
  } finally {
    db.close()
  }
})

it("creation with only an explicit time uses that time on the caller current day", async () => {
  const {ctx, db} = makeRealWorkspace()
  try {
    await expect(findTool("save_task")!.run({content: "Interview", time: "14:30"}, ctx)).resolves.toMatchObject({
      task: {status: "todo", scheduled: {date: "2026-03-24", time: "14:30:00", timezone: "UTC"}},
    })
  } finally {
    db.close()
  }
})

it("workflow transitions accept the actual task status without a coding stage", async () => {
  const {ctx, db} = makeRealWorkspace()
  try {
    const {task} = (await findTool("save_task")!.run({content: "Prepare interview", date: null}, ctx)) as {task: {id: string}}
    const before = await ctx.workStorage.getTaskWorkflow(task.id)
    await expect(
      findTool("update_task_workflow")!.run(
        {taskId: task.id, operationId: "prepare", expectedRevision: before.revision, kind: "transition", status: "todo"},
        ctx,
      ),
    ).resolves.toMatchObject({kind: "transition", outcome: "proposal_pending"})
    const pending = await ctx.workStorage.getTaskWorkflow(task.id)
    expect(pending.task.status).toBe("backlog")
    await ctx.workStorage.resolveTaskWorkflowProposal({
      taskId: task.id,
      proposalId: pending.proposals[0].id,
      decision: "accepted",
      operationId: "accept-status-day",
      expectedRevision: pending.revision,
    })
    expect((await ctx.workStorage.getTask(task.id))?.status).toBe("todo")
  } finally {
    db.close()
  }
})

it("project discovery supplies the real domain and scoped workflow guidance", async () => {
  const {ctx, db} = makeRealWorkspace()
  try {
    await expect(findTool("list_projects")!.run({}, ctx)).resolves.toMatchObject({
      domain: {
        statuses: expect.arrayContaining([expect.objectContaining({status: "backlog"}), expect.objectContaining({status: "cancelled"})]),
        timeUnit: "seconds",
      },
      guidance: {allowCompletion: false, workspace: {content: expect.any(String)}},
      projects: [expect.objectContaining({id: "main", workflowGuidance: expect.objectContaining({allowCompletion: false})})],
    })
  } finally {
    db.close()
  }
})

it("agent contexts contain current guidance and policy while project discovery emits workspace content once", async () => {
  const {ctx, db, core, workStorage} = makeRealWorkspace()
  try {
    const workspaceContents = ["Obsolete workspace instruction 83f1", "Current workspace instruction 4b7e"]
    const projectContents = ["Obsolete project instruction 11a6", "Current project instruction 802c"]
    await core.branchesService.createBranch({name: "Second project", description: "A separate project"})
    for (const content of workspaceContents) {
      const {workspace} = await workStorage.getWorkflowGuidance()
      await workStorage.updateWorkflowGuidance({
        scope: {kind: "workspace"},
        content,
        allowCompletion: true,
        operationId: content,
        expectedRevision: workspace.revision,
      })
    }
    for (const content of projectContents) {
      const {project} = await workStorage.getWorkflowGuidance("main")
      await workStorage.updateWorkflowGuidance({
        scope: {kind: "project", projectId: "main"},
        content,
        allowCompletion: false,
        operationId: content,
        expectedRevision: project!.revision,
      })
    }
    const trusted = await workStorage.getWorkflowGuidance("main")
    expect(trusted.workspace.history).toHaveLength(2)
    expect(trusted.project?.history).toHaveLength(2)
    const {task} = (await findTool("save_task")!.run({content: "Selected task", date: null}, ctx)) as {task: {id: string}}
    const projects = (await findTool("list_projects")!.run({}, ctx)) as {guidance: unknown; projects: {id: string; workflowGuidance: unknown}[]}
    const taskDetail = await findTool("get_task")!.run({id: task.id}, ctx)
    const workflow = await findTool("get_task_workflow")!.run({taskId: task.id}, ctx)
    for (const context of [projects, taskDetail, workflow]) {
      const serialized = JSON.stringify(context)
      expect(serialized).not.toContain(workspaceContents[0])
      expect(serialized).not.toContain(projectContents[0])
      expect(serialized).toContain(workspaceContents[1])
      expect(serialized).toContain(projectContents[1])
    }
    expect(JSON.stringify(projects).split(workspaceContents[1]).length - 1).toBe(1)
    expect(projects.guidance).toMatchObject({workspace: {content: workspaceContents[1], revision: trusted.workspace.revision}, allowCompletion: true})
    expect(projects.projects.find((project) => project.id === "main")?.workflowGuidance).toMatchObject({
      project: {content: projectContents[1], revision: trusted.project!.revision},
      allowCompletion: false,
    })
    for (const project of projects.projects) expect(project.workflowGuidance).not.toHaveProperty("workspace")
  } finally {
    db.close()
  }
})

it("workflow records an independent session state and summary at work boundaries", async () => {
  const {ctx, db} = makeRealWorkspace()
  try {
    const {task} = (await findTool("save_task")!.run({content: "Prepare interview", date: null}, ctx)) as {task: {id: string}}
    const before = await ctx.workStorage.getTaskWorkflow(task.id)
    await expect(
      findTool("update_task_workflow")!.run(
        {
          taskId: task.id,
          operationId: "session",
          expectedRevision: before.revision,
          kind: "session_start",
          sessionId: "interview",
          summary: "Reviewing interview questions",
        },
        ctx,
      ),
    ).resolves.toMatchObject({kind: "session_start"})
    expect((await ctx.workStorage.getTaskWorkflow(task.id)).sessions).toContainEqual(
      expect.objectContaining({sessionId: "interview", state: "working", summary: "Reviewing interview questions"}),
    )
  } finally {
    db.close()
  }
})

it("legacy save_task reviews content and planning changes as one pending proposal", async () => {
  const {ctx, db} = makeRealWorkspace()
  try {
    const {task} = (await findTool("save_task")!.run({content: "Prepare interview", date: null}, ctx)) as {task: {id: string}}
    await expect(
      findTool("save_task")!.run(
        {id: task.id, content: "Prepare interview questions", date: "2026-04-10", time: "14:30", priority: "high", estimatedSeconds: 1800},
        ctx,
      ),
    ).resolves.toMatchObject({
      outcome: "proposal_pending",
      task: {content: "Prepare interview", status: "backlog", scheduled: null, priority: "none", estimatedSeconds: 0},
      proposals: [
        expect.objectContaining({
          status: "pending",
          changes: expect.objectContaining({
            content: "Prepare interview questions",
            status: "todo",
            scheduled: {date: "2026-04-10", time: "14:30:00", timezone: "UTC"},
            priority: "high",
            estimatedTime: 1800,
          }),
        }),
      ],
    })
  } finally {
    db.close()
  }
})
