import {describe, expect, it} from "vitest"

import {runInAgentWorkspace} from "../../src/agents/AgentWorkspace"
import {getTaskTool} from "../../src/agents/tools/read/getTask"
import {deleteCommentTool} from "../../src/agents/tools/write/deleteComment"
import {deleteTaskTool} from "../../src/agents/tools/write/deleteTask"
import {saveCommentTool} from "../../src/agents/tools/write/saveComment"
import {saveMilestoneTool} from "../../src/agents/tools/write/saveMilestone"
import {saveProjectTool} from "../../src/agents/tools/write/saveProject"
import {saveTagTool} from "../../src/agents/tools/write/saveTag"
import {saveTaskTool} from "../../src/agents/tools/write/saveTask"
import {AgentToolErrorCode} from "../../src/errors/agent/AgentToolErrorCode"
import {readSnapshot} from "../../src/snapshot/SnapshotStore"
import {bindAgent, makeTaskDraft, seedAgentStore} from "./helpers"

import type {AgentIdentity, AgentWorkspaceDeps} from "../../src/agents/AgentWorkspace"
import type {AgentTool} from "../../src/agents/tools/types"

function call(deps: AgentWorkspaceDeps, agent: AgentIdentity, tool: AgentTool, input: Record<string, unknown> = {}): Promise<any> {
  return runInAgentWorkspace(deps, agent, tool.mode, (ctx) => tool.run(input, ctx) as any)
}

function dated(date: string, overrides: Record<string, unknown> = {}) {
  return makeTaskDraft({scheduled: {date, time: "09:00:00", timezone: "UTC"}, ...overrides})
}

describe("save_task", () => {
  it("TC-31: an agent whose Mac is already tomorrow relative to the server's clock lands a task on that Mac's today, in that Mac's zone", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent: AgentIdentity = {...bindAgent(seeded.store, "Tokyo Mac"), timeZone: "Asia/Tokyo"}
      const now = () => new Date("2026-06-15T23:30:00Z")

      const result = await call({store: seeded.store, now}, agent, saveTaskTool, {content: "Buy milk"})

      expect(result.task.status).toBe("active")
      expect(result.task.projectId).toBe("main")
      expect(result.task.scheduled.date).toBe("2026-06-16")
      expect(result.task.scheduled.timezone).toBe("Asia/Tokyo")
    } finally {
      seeded.close()
    }
  })

  it("TC-32: two agents whose Macs disagree about the date at the same instant each land on their own Mac's day", async () => {
    const seeded = await seedAgentStore()

    try {
      const now = () => new Date("2026-06-15T23:30:00Z")
      const tokyoAgent: AgentIdentity = {...bindAgent(seeded.store, "Tokyo Mac"), timeZone: "Asia/Tokyo"}
      const laAgent: AgentIdentity = {...bindAgent(seeded.store, "LA Mac"), timeZone: "America/Los_Angeles"}

      const tokyoResult = await call({store: seeded.store, now}, tokyoAgent, saveTaskTool, {content: "Tokyo task"})
      const laResult = await call({store: seeded.store, now}, laAgent, saveTaskTool, {content: "LA task"})

      expect(tokyoResult.task.scheduled.date).toBe("2026-06-16")
      expect(laResult.task.scheduled.date).toBe("2026-06-15")
    } finally {
      seeded.close()
    }
  })

  it("TC-33: updating only content leaves day, time, tags, estimate, project and status untouched", async () => {
    let taskId = ""
    let tagId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const tag = await mac.core.tagsService.createTag({branchId: "main", name: "urgent", color: "#ff0000", deletedAt: null})
      tagId = tag!.id
      const task = await mac.core.tasksService.createTask(
        dated("2026-01-10", {content: "Original", time: undefined, tags: [tag], estimatedTime: 600}),
      )
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      const result = await call({store: seeded.store}, agent, saveTaskTool, {id: taskId, content: "Updated content"})

      expect(result.task.content).toBe("Updated content")
      expect(result.task.scheduled.date).toBe("2026-01-10")
      expect(result.task.scheduled.time).toBe("09:00:00")
      expect(result.task.tags.map((t: any) => t.id)).toEqual([tagId])
      expect(result.task.estimatedSeconds).toBe(600)
      expect(result.task.projectId).toBe("main")
      expect(result.task.status).toBe("active")
    } finally {
      seeded.close()
    }
  })

  it("TC-34: giving a backlog task a day makes it active on that day, and clearing a dated task's day backlogs it with no schedule", async () => {
    let backlogId = ""
    let datedId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const backlogTask = await mac.core.tasksService.createTask(makeTaskDraft({content: "In backlog", status: "backlog", scheduled: null}))
      backlogId = backlogTask!.id
      const datedTask = await mac.core.tasksService.createTask(dated("2026-01-15", {content: "Dated"}))
      datedId = datedTask!.id
    })

    try {
      const agent = bindAgent(seeded.store)

      const promoted = await call({store: seeded.store}, agent, saveTaskTool, {id: backlogId, date: "2026-02-01"})
      expect(promoted.task.status).toBe("active")
      expect(promoted.task.scheduled.date).toBe("2026-02-01")

      const backlogged = await call({store: seeded.store}, agent, saveTaskTool, {id: datedId, date: null})
      expect(backlogged.task.status).toBe("backlog")
      expect(backlogged.task.scheduled).toBeNull()
    } finally {
      seeded.close()
    }
  })

  it("TC-35: setting status to active with no day given lands a backlog task on the agent's Mac's today, in that Mac's zone", async () => {
    let backlogId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const backlogTask = await mac.core.tasksService.createTask(makeTaskDraft({content: "In backlog", status: "backlog", scheduled: null}))
      backlogId = backlogTask!.id
    })

    try {
      const agent: AgentIdentity = {...bindAgent(seeded.store, "Tokyo Mac"), timeZone: "Asia/Tokyo"}
      const now = () => new Date("2026-06-15T23:30:00Z")

      const result = await call({store: seeded.store, now}, agent, saveTaskTool, {id: backlogId, status: "active"})

      expect(result.task.status).toBe("active")
      expect(result.task.scheduled.date).toBe("2026-06-16")
      expect(result.task.scheduled.timezone).toBe("Asia/Tokyo")
    } finally {
      seeded.close()
    }
  })

  it("TC-36: setting status, milestone, tags, estimate and blocking tasks all applies together, and each invalid variant refuses without changing anything", async () => {
    let projectAId = ""
    let projectBId = ""
    let milestoneAId = ""
    let milestoneBId = ""
    let tagAId = ""
    let tagBId = ""
    let taskAId = ""
    let taskBId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const projectA = await mac.core.branchesService.createBranch({name: "Project A"})
      const projectB = await mac.core.branchesService.createBranch({name: "Project B"})
      projectAId = projectA!.id
      projectBId = projectB!.id

      const milestoneA = await mac.core.milestonesService.createMilestone({
        branchId: projectAId,
        name: "MA",
        description: "",
        targetDate: null,
        deletedAt: null,
      })
      const milestoneB = await mac.core.milestonesService.createMilestone({
        branchId: projectBId,
        name: "MB",
        description: "",
        targetDate: null,
        deletedAt: null,
      })
      milestoneAId = milestoneA!.id
      milestoneBId = milestoneB!.id

      const tagA = await mac.core.tagsService.createTag({branchId: projectAId, name: "tag-a", color: "#111111", deletedAt: null})
      const tagB = await mac.core.tagsService.createTag({branchId: projectBId, name: "tag-b", color: "#222222", deletedAt: null})
      tagAId = tagA!.id
      tagBId = tagB!.id

      const taskA = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Task A", branchId: projectAId}))
      const taskB = await mac.core.tasksService.createTask(dated("2026-01-02", {content: "Task B", branchId: projectAId}))
      taskAId = taskA!.id
      taskBId = taskB!.id
    })

    try {
      const agent = bindAgent(seeded.store)

      const ok = await call({store: seeded.store}, agent, saveTaskTool, {
        id: taskAId,
        status: "done",
        milestoneId: milestoneAId,
        tagIds: [tagAId],
        estimatedSeconds: 3600,
        blocks: [taskBId],
      })
      expect(ok.task.status).toBe("done")
      expect(ok.task.milestoneId).toBe(milestoneAId)
      expect(ok.task.tags.map((t: any) => t.id)).toEqual([tagAId])
      expect(ok.task.estimatedSeconds).toBe(3600)
      expect(ok.task.blocks.map((t: any) => t.id)).toEqual([taskBId])

      const revisionAfterOk = readSnapshot(seeded.store)!.revision

      await expect(call({store: seeded.store}, agent, saveTaskTool, {id: taskAId, milestoneId: milestoneBId})).rejects.toMatchObject({
        code: AgentToolErrorCode.NOT_FOUND,
      })
      await expect(call({store: seeded.store}, agent, saveTaskTool, {id: taskAId, tagIds: [tagBId]})).rejects.toMatchObject({
        code: AgentToolErrorCode.NOT_FOUND,
      })
      await expect(call({store: seeded.store}, agent, saveTaskTool, {id: "no-such-id", content: "x"})).rejects.toMatchObject({
        code: AgentToolErrorCode.NOT_FOUND,
      })
      await expect(call({store: seeded.store}, agent, saveTaskTool, {id: taskAId, blocks: [taskAId]})).rejects.toMatchObject({
        code: AgentToolErrorCode.INVALID_INPUT,
      })

      expect(readSnapshot(seeded.store)!.revision).toBe(revisionAfterOk)
    } finally {
      seeded.close()
    }
  })

  it("TC-37: marking a task done and rescheduling another each record the same history events the app records", async () => {
    let doneId = ""
    let moveId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const doneTask = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Finish me", status: "active"}))
      doneId = doneTask!.id
      const moveTask = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Move me"}))
      moveId = moveTask!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      await call({store: seeded.store}, agent, saveTaskTool, {id: doneId, status: "done"})
      await call({store: seeded.store}, agent, saveTaskTool, {id: moveId, date: "2026-01-05"})

      const doneResult = await call({store: seeded.store}, agent, saveTaskTool, {id: doneId, content: "Finish me"})
      const moveResult = await call({store: seeded.store}, agent, saveTaskTool, {id: moveId, content: "Move me"})

      expect(doneResult.task.history.some((e: any) => e.type === "completed")).toBe(true)
      expect(moveResult.task.history.some((e: any) => e.type === "moved")).toBe(true)
    } finally {
      seeded.close()
    }
  })

  it("refuses an unknown projectId on save_task, whether creating or updating, and changes nothing", async () => {
    let taskId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Existing"}))
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      const revisionBefore = readSnapshot(seeded.store)!.revision

      await expect(call({store: seeded.store}, agent, saveTaskTool, {content: "New task", projectId: "no-such-project"})).rejects.toMatchObject({
        code: AgentToolErrorCode.NOT_FOUND,
      })
      await expect(call({store: seeded.store}, agent, saveTaskTool, {id: taskId, projectId: "no-such-project"})).rejects.toMatchObject({
        code: AgentToolErrorCode.NOT_FOUND,
      })

      expect(readSnapshot(seeded.store)!.revision).toBe(revisionBefore)
    } finally {
      seeded.close()
    }
  })

  it("moves a task to a real project through save_task and clears a relation that would cross projects", async () => {
    let projectBId = ""
    let blockerId = ""
    let blockedId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const projectB = await mac.core.branchesService.createBranch({name: "Project B"})
      projectBId = projectB!.id

      const blocker = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Blocker"}))
      const blocked = await mac.core.tasksService.createTask(dated("2026-01-02", {content: "Blocked"}))
      blockerId = blocker!.id
      blockedId = blocked!.id
      await mac.core.taskRelationsService.setTaskRelations(blockedId, {blockedBy: [blockerId], blocks: []})
    })

    try {
      const agent = bindAgent(seeded.store)

      const moved = await call({store: seeded.store}, agent, saveTaskTool, {id: blockerId, projectId: projectBId})
      expect(moved.task.projectId).toBe(projectBId)

      const stored = readSnapshot(seeded.store)!.document.docs as any
      const remainingRelations = stored.relations.filter((r: any) => r.deleted_at === null)
      expect(remainingRelations.some((r: any) => r.blocker_id === blockerId)).toBe(false)
    } finally {
      seeded.close()
    }
  })
})

describe("delete_task", () => {
  it("TC-38: soft-deletes a task that blocks another, keeping it present with its deletedAt, clearing it as a blocker, deleting nothing for good", async () => {
    let blockerId = ""
    let blockedId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const blocker = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Blocker"}))
      const blocked = await mac.core.tasksService.createTask(dated("2026-01-02", {content: "Blocked"}))
      blockerId = blocker!.id
      blockedId = blocked!.id
      await mac.core.taskRelationsService.setTaskRelations(blockedId, {blockedBy: [blockerId], blocks: []})
    })

    try {
      const agent = bindAgent(seeded.store)
      const result = await call({store: seeded.store}, agent, deleteTaskTool, {id: blockerId})

      expect(result.id).toBe(blockerId)
      expect(result.deletedAt).toBeTruthy()

      const stored = readSnapshot(seeded.store)!.document.docs as any
      const blockerRow = stored.tasks.find((t: any) => t.id === blockerId)
      expect(blockerRow).toBeTruthy()
      expect(blockerRow.deleted_at).toBeTruthy()

      const remainingRelations = stored.relations.filter((r: any) => r.deleted_at === null)
      expect(remainingRelations.some((r: any) => r.blocker_id === blockerId)).toBe(false)
    } finally {
      seeded.close()
    }
  })
})

describe("save_project", () => {
  it("TC-39: creates and renames succeed; a duplicate name and renaming main each refuse, naming why, and change nothing", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      await mac.core.branchesService.createBranch({name: "Existing"})
    })

    try {
      const agent = bindAgent(seeded.store)

      const created = await call({store: seeded.store}, agent, saveProjectTool, {name: "New project"})
      expect(created.project.name).toBe("New project")

      const renamed = await call({store: seeded.store}, agent, saveProjectTool, {id: created.project.id, name: "Renamed project"})
      expect(renamed.project.name).toBe("Renamed project")

      const revisionAfterOk = readSnapshot(seeded.store)!.revision

      await expect(call({store: seeded.store}, agent, saveProjectTool, {name: "Existing"})).rejects.toMatchObject({
        code: AgentToolErrorCode.INVALID_INPUT,
      })
      await expect(call({store: seeded.store}, agent, saveProjectTool, {id: "main", name: "Not main anymore"})).rejects.toMatchObject({
        code: AgentToolErrorCode.INVALID_INPUT,
      })

      expect(readSnapshot(seeded.store)!.revision).toBe(revisionAfterOk)
    } finally {
      seeded.close()
    }
  })
})

describe("save_milestone", () => {
  it("TC-40: creating with a target date and then editing name, description and target date both answer the milestone, and the changes land", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)

      const created = await call({store: seeded.store}, agent, saveMilestoneTool, {
        projectId: "main",
        name: "Launch",
        targetDate: "2026-12-01",
      })
      expect(created.milestone.name).toBe("Launch")
      expect(created.milestone.targetDate).toBe("2026-12-01")
      expect(created.milestone.progress).toEqual({total: 0, resolved: 0})
      expect(created.milestone.isClosed).toBe(false)

      const edited = await call({store: seeded.store}, agent, saveMilestoneTool, {
        id: created.milestone.id,
        name: "Launch v2",
        description: "updated",
        targetDate: "2026-12-15",
      })
      expect(edited.milestone.name).toBe("Launch v2")
      expect(edited.milestone.description).toBe("updated")
      expect(edited.milestone.targetDate).toBe("2026-12-15")

      const stored = readSnapshot(seeded.store)!.document.docs as any
      const row = stored.milestones.find((m: any) => m.id === created.milestone.id)
      expect(row.name).toBe("Launch v2")
      expect(row.target_date).toBe("2026-12-15")
    } finally {
      seeded.close()
    }
  })
})

describe("save_tag", () => {
  it("TC-41: creating a tag and then changing its name and colour both answer the tag, and the changes land", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)

      const created = await call({store: seeded.store}, agent, saveTagTool, {projectId: "main", name: "urgent", color: "#ff0000"})
      expect(created.tag.name).toBe("urgent")
      expect(created.tag.color).toBe("#ff0000")

      const edited = await call({store: seeded.store}, agent, saveTagTool, {id: created.tag.id, name: "critical", color: "#00ff00"})
      expect(edited.tag.name).toBe("critical")
      expect(edited.tag.color).toBe("#00ff00")

      const stored = readSnapshot(seeded.store)!.document.docs as any
      const row = stored.tags.find((t: any) => t.id === created.tag.id)
      expect(row.name).toBe("critical")
      expect(row.color).toBe("#00ff00")
    } finally {
      seeded.close()
    }
  })
})

describe("save_comment", () => {
  it("TC-65: a new comment lands on the task marked as coming through MCP under the caller's own approved name, and rewriting it changes only the text", async () => {
    let taskId = ""
    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(makeTaskDraft({content: "Ship the thing"}))
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store, "Agent Mac", "UTC", "Claude Code")

      const created = await call({store: seeded.store}, agent, saveCommentTool, {taskId, content: "  Blocked on review  "})
      expect(created.comment.content).toBe("Blocked on review")
      expect(created.comment.kind).toBe("mcp")
      expect(created.comment.provider).toBe("Claude Code")

      const rewritten = await call({store: seeded.store}, agent, saveCommentTool, {id: created.comment.id, content: "Review landed"})
      expect(rewritten.comment.id).toBe(created.comment.id)
      expect(rewritten.comment.content).toBe("Review landed")
      expect(rewritten.comment.kind).toBe("mcp")
      expect(rewritten.comment.provider).toBe("Claude Code")

      const stored = readSnapshot(seeded.store)!.document.docs as any
      const row = stored.comments.find((c: any) => c.id === created.comment.id)
      expect(row.content).toBe("Review landed")
      expect(row.task_id).toBe(taskId)
      expect(row.kind).toBe("mcp")
      expect(row.provider).toBe("Claude Code")
      expect(row.deleted_at).toBe(null)
    } finally {
      seeded.close()
    }
  })

  it("TC-66: two agents commenting on the same task are each attributed to their own name, not to whichever wrote last", async () => {
    let taskId = ""
    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(makeTaskDraft({content: "Shared task"}))
      taskId = task!.id
    })

    try {
      const claudeCode = bindAgent(seeded.store, "Mac A", "UTC", "Claude Code")
      const codex = bindAgent(seeded.store, "Mac B", "UTC", "Codex")

      const first = await call({store: seeded.store}, claudeCode, saveCommentTool, {taskId, content: "from Claude Code"})
      const second = await call({store: seeded.store}, codex, saveCommentTool, {taskId, content: "from Codex"})

      expect(first.comment.provider).toBe("Claude Code")
      expect(second.comment.provider).toBe("Codex")
    } finally {
      seeded.close()
    }
  })

  it("TC-67: kind and provider cannot be forged through the tool's input — the schema declares no such fields and the tool never reads them, so the caller's own name is written either way", async () => {
    let taskId = ""
    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(makeTaskDraft({content: "Attributed task"}))
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store, "Agent Mac", "UTC", "Claude Code")

      expect(saveCommentTool.inputSchema.additionalProperties).toBe(false)
      expect(Object.keys(saveCommentTool.inputSchema.properties)).toEqual(["id", "taskId", "content"])

      const forged = await call({store: seeded.store}, agent, saveCommentTool, {
        taskId,
        content: "pretending to be a person",
        kind: "manual",
        provider: "The User",
      })

      expect(forged.comment.kind).toBe("mcp")
      expect(forged.comment.provider).toBe("Claude Code")

      const stored = readSnapshot(seeded.store)!.document.docs as any
      const row = stored.comments.find((c: any) => c.id === forged.comment.id)
      expect(row.kind).toBe("mcp")
      expect(row.provider).toBe("Claude Code")
    } finally {
      seeded.close()
    }
  })

  it("TC-68: a comment on an unknown task, on a deleted one, a rewrite of an unknown comment and blank content all refuse, and nothing lands", async () => {
    let deletedTaskId = ""
    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(makeTaskDraft({content: "Doomed"}))
      deletedTaskId = task!.id
      await mac.core.tasksService.deleteTask(deletedTaskId)
    })

    try {
      const agent = bindAgent(seeded.store)

      await expect(call({store: seeded.store}, agent, saveCommentTool, {taskId: "nope", content: "hi"})).rejects.toMatchObject({
        code: AgentToolErrorCode.NOT_FOUND,
      })
      await expect(call({store: seeded.store}, agent, saveCommentTool, {taskId: deletedTaskId, content: "hi"})).rejects.toMatchObject({
        code: AgentToolErrorCode.NOT_FOUND,
      })
      await expect(call({store: seeded.store}, agent, saveCommentTool, {id: "nope", content: "hi"})).rejects.toMatchObject({
        code: AgentToolErrorCode.NOT_FOUND,
      })
      await expect(call({store: seeded.store}, agent, saveCommentTool, {taskId: deletedTaskId, content: "   "})).rejects.toMatchObject({
        code: AgentToolErrorCode.INVALID_INPUT,
      })

      const stored = readSnapshot(seeded.store)!.document.docs as any
      expect(stored.comments).toEqual([])
    } finally {
      seeded.close()
    }
  })
})

describe("delete_comment", () => {
  it("TC-69: deleting a comment soft-deletes it, get_task stops answering it, and deleting it again refuses NOT_FOUND", async () => {
    let taskId = ""
    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(makeTaskDraft({content: "Commented task"}))
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store, "Agent Mac", "UTC", "Claude Code")

      const kept = await call({store: seeded.store}, agent, saveCommentTool, {taskId, content: "keep me"})
      const doomed = await call({store: seeded.store}, agent, saveCommentTool, {taskId, content: "delete me"})

      const deleted = await call({store: seeded.store}, agent, deleteCommentTool, {id: doomed.comment.id})
      expect(deleted).toEqual({id: doomed.comment.id})

      const stored = readSnapshot(seeded.store)!.document.docs as any
      const row = stored.comments.find((c: any) => c.id === doomed.comment.id)
      expect(row).toBeDefined()
      expect(row.deleted_at).toEqual(expect.any(String))

      const task = await call({store: seeded.store}, agent, getTaskTool, {id: taskId})
      expect(task.comments.map((c: any) => c.id)).toEqual([kept.comment.id])

      await expect(call({store: seeded.store}, agent, deleteCommentTool, {id: doomed.comment.id})).rejects.toMatchObject({
        code: AgentToolErrorCode.NOT_FOUND,
      })
    } finally {
      seeded.close()
    }
  })
})
