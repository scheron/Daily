import {readdir} from "node:fs/promises"
import {Readable} from "node:stream"
import {describe, expect, it} from "vitest"

import {APP_CONFIG} from "@daily/protocol"

import {AGENT_WRITE_ATTEMPTS, runInAgentWorkspace} from "../../src/agents/AgentWorkspace"
import {getAttachmentTool} from "../../src/agents/tools/read/getAttachment"
import {getTaskTool} from "../../src/agents/tools/read/getTask"
import {deleteAttachmentTool} from "../../src/agents/tools/write/deleteAttachment"
import {deleteCommentTool} from "../../src/agents/tools/write/deleteComment"
import {deleteTaskTool} from "../../src/agents/tools/write/deleteTask"
import {saveAttachmentTool} from "../../src/agents/tools/write/saveAttachment"
import {saveCommentTool} from "../../src/agents/tools/write/saveComment"
import {saveMilestoneTool} from "../../src/agents/tools/write/saveMilestone"
import {saveProjectTool} from "../../src/agents/tools/write/saveProject"
import {saveTagTool} from "../../src/agents/tools/write/saveTag"
import {saveTaskTool} from "../../src/agents/tools/write/saveTask"
import {assetsDir, listAssets, writeAsset} from "../../src/assets/AssetStore"
import {AgentToolError} from "../../src/errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../src/errors/agent/AgentToolErrorCode"
import {readRevision, readSnapshot} from "../../src/snapshot/SnapshotStore"
import {bindAgent, bindDevice, makePngBytes, makeTaskDraft, openMacCore, seedAgentStore, writeMacSnapshot} from "./helpers"

import type {AgentIdentity, AgentWorkspaceDeps} from "../../src/agents/AgentWorkspace"
import type {AgentTool} from "../../src/agents/tools/types"
import type {ServerStore} from "../../src/store/instance"

function call(deps: AgentWorkspaceDeps, agent: AgentIdentity, tool: AgentTool, input: Record<string, unknown> = {}): Promise<any> {
  return runInAgentWorkspace(deps, agent, tool.mode, (ctx) => tool.run(input, ctx) as any)
}

function dated(date: string, overrides: Record<string, unknown> = {}) {
  return makeTaskDraft({scheduled: {date, time: "09:00:00", timezone: "UTC"}, ...overrides})
}

function putOnServer(store: ServerStore, fileId: string, ext: string, bytes: Buffer): Promise<unknown> {
  const deviceId = bindDevice(store, "Uploader Mac")
  return writeAsset(store, `${fileId}.${ext}`, Readable.from(bytes), deviceId, 10 * 1024 * 1024)
}

/**
 * Awaits `promise` expecting it to reject with a structured `AgentToolError` — some specific,
 * named code from the tool's own enum, carrying a real explanation — rather than a bare crash.
 * Returns the error so a case can still check the one field the plan pins down.
 */
async function expectRejectsWithAgentError(promise: Promise<unknown>): Promise<AgentToolError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(AgentToolError)
    const agentError = error as AgentToolError
    expect(Object.values(AgentToolErrorCode)).toContain(agentError.code)
    expect(agentError.message.length).toBeGreaterThan(0)
    return agentError
  }
  throw new Error("expected the call to reject")
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

  it("TC-13: deleted: false returns a task from the trash and records restored", async () => {
    let taskId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Trashed"}))
      taskId = task!.id
      await mac.core.tasksService.deleteTask(taskId)
    })

    try {
      const agent = bindAgent(seeded.store)
      const result = await call({store: seeded.store}, agent, saveTaskTool, {id: taskId, deleted: false})

      expect(result.task.deletedAt).toBeNull()
      expect(result.task.history.some((e: any) => e.type === "restored")).toBe(true)
    } finally {
      seeded.close()
    }
  })

  it("TC-14: addSpentSeconds adds to the time already logged", async () => {
    let taskId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Ticking", spentTime: 600}))
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      const result = await call({store: seeded.store}, agent, saveTaskTool, {id: taskId, addSpentSeconds: 2700})

      expect(result.task.spentSeconds).toBe(3300)
    } finally {
      seeded.close()
    }
  })

  it("TC-15: a negative addSpentSeconds subtracts but never below zero", async () => {
    let taskId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Ticking", spentTime: 600}))
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      const result = await call({store: seeded.store}, agent, saveTaskTool, {id: taskId, addSpentSeconds: -1200})

      expect(result.task.spentSeconds).toBe(0)
    } finally {
      seeded.close()
    }
  })

  it("TC-17: afterTaskId and beforeTaskId together refuse INVALID_INPUT", async () => {
    let taskId = ""
    let otherId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Movable"}))
      taskId = task!.id
      const other = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Other"}))
      otherId = other!.id
    })

    try {
      const agent = bindAgent(seeded.store)

      await expect(call({store: seeded.store}, agent, saveTaskTool, {id: taskId, afterTaskId: otherId, beforeTaskId: otherId})).rejects.toMatchObject(
        {code: AgentToolErrorCode.INVALID_INPUT},
      )
    } finally {
      seeded.close()
    }
  })

  it("TC-18: one call applies a batch of tasks, and the stored snapshot advances by exactly one revision", async () => {
    let idA = ""
    let idB = ""
    let idC = ""

    const seeded = await seedAgentStore(async (mac) => {
      const a = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "A"}))
      const b = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "B"}))
      const c = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "C"}))
      idA = a!.id
      idB = b!.id
      idC = c!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      const revisionBefore = readSnapshot(seeded.store)!.revision

      const result = await call({store: seeded.store}, agent, saveTaskTool, {
        tasks: [
          {id: idA, date: "2026-01-02"},
          {id: idB, date: "2026-01-02"},
          {id: idC, date: "2026-01-02"},
        ],
      })

      expect(result.tasks).toHaveLength(3)
      expect(result.tasks.every((t: any) => t.scheduled.date === "2026-01-02")).toBe(true)
      expect(readSnapshot(seeded.store)!.revision).toBe(String(Number(revisionBefore) + 1))
    } finally {
      seeded.close()
    }
  })

  it("TC-19: a batch naming an unknown task refuses NOT_FOUND, and none of the batch changes", async () => {
    let idA = ""
    let idC = ""

    const seeded = await seedAgentStore(async (mac) => {
      const a = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "A"}))
      const c = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "C"}))
      idA = a!.id
      idC = c!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      const revisionBefore = readSnapshot(seeded.store)!.revision

      await expect(
        call({store: seeded.store}, agent, saveTaskTool, {
          tasks: [
            {id: idA, date: "2026-01-02"},
            {id: "no-such-id", date: "2026-01-02"},
            {id: idC, date: "2026-01-02"},
          ],
        }),
      ).rejects.toMatchObject({code: AgentToolErrorCode.NOT_FOUND})

      expect(readSnapshot(seeded.store)!.revision).toBe(revisionBefore)
    } finally {
      seeded.close()
    }
  })

  it("TC-20: tasks alongside a top-level task field refuses INVALID_INPUT", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)

      await expect(call({store: seeded.store}, agent, saveTaskTool, {tasks: [{content: "Solo"}], content: "Top level"})).rejects.toMatchObject({
        code: AgentToolErrorCode.INVALID_INPUT,
      })
    } finally {
      seeded.close()
    }
  })

  it("a call that loses every write race leaves no bytes and no assets row behind, even though save_attachment staged them on every attempt", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)
      const png = makePngBytes()
      let attempts = 0

      await expect(
        runInAgentWorkspace({store: seeded.store}, agent, "write", async (ctx) => {
          attempts++

          const rival = openMacCore()
          try {
            await rival.core.tasksService.createTask(makeTaskDraft({content: `Rival ${attempts}`}))
            const rivalDeviceId = bindDevice(seeded.store, `Rival Mac ${attempts}`)
            await writeMacSnapshot(seeded.store, rival, readRevision(seeded.store), rivalDeviceId)
          } finally {
            rival.close()
          }

          return saveAttachmentTool.run({name: "shot.png", dataBase64: png.toString("base64")}, ctx)
        }),
      ).rejects.toMatchObject({code: AgentToolErrorCode.WRITE_CONFLICT})

      expect(attempts).toBe(AGENT_WRITE_ATTEMPTS)
      expect(listAssets(seeded.store)).toEqual([])
      expect(await readdir(assetsDir(seeded.store))).toEqual([])
    } finally {
      seeded.close()
    }
  })

  it("TC-3: kind and provider in the input never reach the event — it is signed from the caller's own identity", async () => {
    let taskId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Original"}))
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store, "Agent Mac", "UTC", "Test Client")

      expect(saveTaskTool.inputSchema.additionalProperties).toBe(false)
      expect(Object.keys(saveTaskTool.inputSchema.properties)).not.toContain("kind")
      expect(Object.keys(saveTaskTool.inputSchema.properties)).not.toContain("provider")

      const result = await call({store: seeded.store}, agent, saveTaskTool, {
        id: taskId,
        content: "Edited",
        kind: "manual",
        provider: "Oleg",
      })

      const edited = result.task.history.find((e: any) => e.type === "edited")
      expect(edited.kind).toBe("mcp")
      expect(edited.provider).toBe("Test Client")

      const stored = readSnapshot(seeded.store)!.document.docs as any
      const row = stored.events.find((e: any) => e.task_id === taskId && e.type === "edited")
      expect(row.kind).toBe("mcp")
      expect(row.provider).toBe("Test Client")
      expect(row.kind).not.toBe("manual")
      expect(row.provider).not.toBe("Oleg")
    } finally {
      seeded.close()
    }
  })

  it("TC-6: addAttachments and removeAttachmentIds are gone from the schema at both levels, and the tool never reads either one", async () => {
    expect(Object.keys(saveTaskTool.inputSchema.properties)).not.toContain("addAttachments")
    expect(Object.keys(saveTaskTool.inputSchema.properties)).not.toContain("removeAttachmentIds")

    const taskItemProperties = (saveTaskTool.inputSchema.properties.tasks as any).items.properties
    expect(Object.keys(taskItemProperties)).not.toContain("addAttachments")
    expect(Object.keys(taskItemProperties)).not.toContain("removeAttachmentIds")

    let topLevelTaskId = ""
    let topLevelFileId = ""
    let batchTaskId = ""
    let batchFileId = ""

    const seeded = await seedAgentStore(async (mac) => {
      topLevelFileId = await mac.core.filesService.saveFile("top-level.png", makePngBytes())
      const topLevelTask = await mac.core.tasksService.createTask(
        dated("2026-01-01", {content: `Top level ![shot](${APP_CONFIG.filesProtocol}/${topLevelFileId})`}),
      )
      topLevelTaskId = topLevelTask!.id

      batchFileId = await mac.core.filesService.saveFile("batch.png", makePngBytes())
      const batchTask = await mac.core.tasksService.createTask(
        dated("2026-01-01", {content: `Inside a batch ![shot](${APP_CONFIG.filesProtocol}/${batchFileId})`}),
      )
      batchTaskId = batchTask!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      const png = makePngBytes().toString("base64")

      const topLevelResult = await call({store: seeded.store}, agent, saveTaskTool, {
        id: topLevelTaskId,
        addAttachments: [{name: "new.png", dataBase64: png}],
        removeAttachmentIds: [topLevelFileId],
      })
      expect(topLevelResult.task.attachments.map((a: any) => a.id)).toEqual([topLevelFileId])

      const batchResult = await call({store: seeded.store}, agent, saveTaskTool, {
        tasks: [{id: batchTaskId, addAttachments: [{name: "new2.png", dataBase64: png}], removeAttachmentIds: [batchFileId]}],
      })
      expect(batchResult.tasks[0].attachments.map((a: any) => a.id)).toEqual([batchFileId])

      expect(listAssets(seeded.store)).toEqual([])
      expect(await readdir(assetsDir(seeded.store))).toEqual([])
    } finally {
      seeded.close()
    }
  })
})

describe("save_attachment", () => {
  it("TC-1: saves bytes to a fresh store and answers id, name, mimeType, size and a url get_attachment reads the same bytes back from", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)
      const png = makePngBytes(96)

      const saved = await call({store: seeded.store}, agent, saveAttachmentTool, {name: "shot.png", dataBase64: png.toString("base64")})

      expect(typeof saved.id).toBe("string")
      expect(saved.id.length).toBeGreaterThan(0)
      expect(typeof saved.name).toBe("string")
      expect(saved.mimeType).toBe("image/png")
      expect(saved.size).toBe(png.length)
      expect(saved.url).toBe(`${APP_CONFIG.filesProtocol}/${saved.id}`)

      const fetched = await call({store: seeded.store}, agent, getAttachmentTool, {id: saved.id})
      expect(fetched.mimeType).toBe("image/png")
      expect(fetched.size).toBe(png.length)
      expect(Buffer.from(fetched.dataBase64, "base64").equals(png)).toBe(true)
    } finally {
      seeded.close()
    }
  })

  it("TC-3: a non-image or a file over 5 MiB refuses with the tool's own error code, and creates nothing", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)
      const revisionBefore = readSnapshot(seeded.store)!.revision
      const notAnImage = Buffer.from("just some text, not a picture").toString("base64")
      const oversized = makePngBytes(6 * 1024 * 1024).toString("base64")

      await expectRejectsWithAgentError(call({store: seeded.store}, agent, saveAttachmentTool, {name: "notes.txt", dataBase64: notAnImage}))
      await expectRejectsWithAgentError(call({store: seeded.store}, agent, saveAttachmentTool, {name: "huge.png", dataBase64: oversized}))
      await expectRejectsWithAgentError(call({store: seeded.store}, agent, saveAttachmentTool, {name: "evil.png", dataBase64: notAnImage}))

      expect(readSnapshot(seeded.store)!.revision).toBe(revisionBefore)
      expect(readSnapshot(seeded.store)!.document.docs.files).toEqual([])
      expect(listAssets(seeded.store)).toEqual([])
      expect(await readdir(assetsDir(seeded.store))).toEqual([])
    } finally {
      seeded.close()
    }
  })

  it("TC-2: a file linked from a task's text is shown among that task's attachments, and cleanup does not collect it", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)
      const png = makePngBytes(96)

      const saved = await call({store: seeded.store}, agent, saveAttachmentTool, {name: "shot.png", dataBase64: png.toString("base64")})
      const written = await call({store: seeded.store}, agent, saveTaskTool, {content: `Shot ![shot](${saved.url})`})
      const taskId = written.task.id

      const fetchedTask = await call({store: seeded.store}, agent, getTaskTool, {id: taskId})
      expect(fetchedTask.attachments.map((a: any) => a.id)).toContain(saved.id)

      await runInAgentWorkspace({store: seeded.store}, agent, "write", async (ctx) => {
        await ctx.core.filesService.cleanupOrphanFiles()
        return null
      })

      const stillThere = await call({store: seeded.store}, agent, getAttachmentTool, {id: saved.id})
      expect(Buffer.from(stillThere.dataBase64, "base64").equals(png)).toBe(true)
    } finally {
      seeded.close()
    }
  })
})

describe("delete_attachment", () => {
  it("TC-4: deletes a file nothing references along with its bytes, and get_attachment then answers ATTACHMENT_UNAVAILABLE", async () => {
    let fileId = ""

    const seeded = await seedAgentStore(async (mac) => {
      fileId = await mac.core.filesService.saveFile("orphan.png", makePngBytes())
    })

    try {
      await putOnServer(seeded.store, fileId, "png", makePngBytes())
      const agent = bindAgent(seeded.store)

      const result = await call({store: seeded.store}, agent, deleteAttachmentTool, {id: fileId})
      expect(result.id).toBe(fileId)

      expect(await readdir(assetsDir(seeded.store))).not.toContain(`${fileId}.png`)

      await expect(call({store: seeded.store}, agent, getAttachmentTool, {id: fileId})).rejects.toMatchObject({
        code: AgentToolErrorCode.ATTACHMENT_UNAVAILABLE,
      })
    } finally {
      seeded.close()
    }
  })

  it("TC-5: refuses to delete a file a live task's text still links to, explaining why, and leaves the file whole", async () => {
    let fileId = ""

    const seeded = await seedAgentStore(async (mac) => {
      fileId = await mac.core.filesService.saveFile("still-used.png", makePngBytes())
      await mac.core.tasksService.createTask(dated("2026-01-01", {content: `Linked ![shot](${APP_CONFIG.filesProtocol}/${fileId})`}))
    })

    try {
      await putOnServer(seeded.store, fileId, "png", makePngBytes())
      const agent = bindAgent(seeded.store)

      await expectRejectsWithAgentError(call({store: seeded.store}, agent, deleteAttachmentTool, {id: fileId}))

      const stillThere = await call({store: seeded.store}, agent, getAttachmentTool, {id: fileId})
      expect(Buffer.from(stillThere.dataBase64, "base64").length).toBe(stillThere.size)
      expect(await readdir(assetsDir(seeded.store))).toContain(`${fileId}.png`)
    } finally {
      seeded.close()
    }
  })

  it("refuses to delete a file only a trashed task's text still links to, explaining why, and leaves the file whole", async () => {
    let fileId = ""

    const seeded = await seedAgentStore(async (mac) => {
      fileId = await mac.core.filesService.saveFile("still-used.png", makePngBytes())
      const task = await mac.core.tasksService.createTask(dated("2026-01-01", {content: `Linked ![shot](${APP_CONFIG.filesProtocol}/${fileId})`}))
      await mac.core.tasksService.deleteTask(task!.id)
    })

    try {
      await putOnServer(seeded.store, fileId, "png", makePngBytes())
      const agent = bindAgent(seeded.store)

      await expectRejectsWithAgentError(call({store: seeded.store}, agent, deleteAttachmentTool, {id: fileId}))

      const stillThere = await call({store: seeded.store}, agent, getAttachmentTool, {id: fileId})
      expect(Buffer.from(stillThere.dataBase64, "base64").length).toBe(stillThere.size)
      expect(await readdir(assetsDir(seeded.store))).toContain(`${fileId}.png`)
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
