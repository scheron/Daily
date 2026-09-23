import {Readable} from "node:stream"
import {describe, expect, it} from "vitest"

import {APP_CONFIG} from "@daily/protocol"

import {runInAgentWorkspace} from "../../src/agents/AgentWorkspace"
import {getAttachmentTool} from "../../src/agents/tools/read/getAttachment"
import {getTaskTool} from "../../src/agents/tools/read/getTask"
import {listMilestonesTool} from "../../src/agents/tools/read/listMilestones"
import {listProjectsTool} from "../../src/agents/tools/read/listProjects"
import {listTagsTool} from "../../src/agents/tools/read/listTags"
import {listTasksTool} from "../../src/agents/tools/read/listTasks"
import {saveTaskTool} from "../../src/agents/tools/write/saveTask"
import {writeAsset} from "../../src/assets/AssetStore"
import {AgentToolErrorCode} from "../../src/errors/agent/AgentToolErrorCode"
import {bindAgent, bindDevice, makePngBytes, makeTaskDraft, seedAgentStore} from "./helpers"

import type {AgentTool} from "../../src/agents/tools/types"
import type {ServerStore} from "../../src/store/instance"
import type {MacCore} from "./helpers"

async function call(store: ServerStore, tool: AgentTool, input: Record<string, unknown> = {}): Promise<any> {
  const agent = bindAgent(store)
  return runInAgentWorkspace({store}, agent, tool.mode, (ctx) => tool.run(input, ctx) as any)
}

function putOnServer(store: ServerStore, fileId: string, ext: string, bytes: Buffer): Promise<unknown> {
  const deviceId = bindDevice(store, "Uploader Mac")
  return writeAsset(store, `${fileId}.${ext}`, Readable.from(bytes), deviceId, 10 * 1024 * 1024)
}

function dated(date: string, overrides: Record<string, unknown> = {}) {
  return makeTaskDraft({scheduled: {date, time: "09:00:00", timezone: "UTC"}, ...overrides})
}

function backlog(overrides: Record<string, unknown> = {}) {
  return makeTaskDraft({status: "backlog", scheduled: null, ...overrides})
}

function stampCompletionCreatedAt(mac: MacCore, taskId: string, createdAt: string): void {
  mac.db.prepare(`UPDATE task_events SET created_at = ? WHERE task_id = ? AND type = 'completed'`).run(createdAt, taskId)
}

describe("list_tasks", () => {
  it("TC-21: dated tasks come first by day then manual order, backlog tasks after, and the total is reported", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      await mac.core.tasksService.createTask(dated("2026-02-02", {content: "Day2", orderIndex: 500}))
      await mac.core.tasksService.createTask(dated("2026-02-01", {content: "Day1-B", orderIndex: 2000}))
      await mac.core.tasksService.createTask(dated("2026-02-01", {content: "Day1-A", orderIndex: 1000}))
      await mac.core.tasksService.createTask(backlog({content: "Backlog-B", orderIndex: 2000}))
      await mac.core.tasksService.createTask(backlog({content: "Backlog-A", orderIndex: 1000}))
    })

    try {
      const result = await call(seeded.store, listTasksTool)

      expect(result.tasks.map((t: any) => t.content)).toEqual(["Day1-A", "Day1-B", "Day2", "Backlog-A", "Backlog-B"])
      expect(result.total).toBe(5)
    } finally {
      seeded.close()
    }
  })

  it("TC-22: each filter, alone and combined, answers exactly the tasks that match", async () => {
    let milestoneId = ""
    let tagId = ""
    let otherProjectId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const otherProject = await mac.core.branchesService.createBranch({name: "Other"})
      otherProjectId = otherProject!.id
      const milestone = await mac.core.milestonesService.createMilestone({
        branchId: "main",
        name: "M1",
        description: "",
        targetDate: null,
        deletedAt: null,
      })
      milestoneId = milestone!.id
      const tag = await mac.core.tagsService.createTag({branchId: "main", name: "urgent", color: "#ff0000", deletedAt: null})
      tagId = tag!.id

      await mac.core.tasksService.createTask(dated("2026-03-01", {content: "MainActive", milestoneId, tags: [tag]}))
      await mac.core.tasksService.createTask(dated("2026-03-02", {content: "MainActiveOther"}))
      await mac.core.tasksService.createTask(dated("2026-03-05", {content: "OutOfRange"}))
      await mac.core.tasksService.createTask(backlog({content: "MainBacklog"}))
      await mac.core.tasksService.createTask({...dated("2026-03-09", {content: "OtherProject"}), branchId: otherProjectId})
      const done = await mac.core.tasksService.createTask(dated("2026-03-01", {content: "MainDone"}))
      await mac.core.tasksService.updateTask(done!.id, {status: "done"})
    })

    try {
      const byProject = await call(seeded.store, listTasksTool, {projectId: otherProjectId})
      expect(byProject.tasks.map((t: any) => t.content)).toEqual(["OtherProject"])

      const byStatus = await call(seeded.store, listTasksTool, {status: "backlog"})
      expect(byStatus.tasks.map((t: any) => t.content)).toEqual(["MainBacklog"])

      const byDate = await call(seeded.store, listTasksTool, {date: "2026-03-01"})
      expect(byDate.tasks.map((t: any) => t.content).sort()).toEqual(["MainActive", "MainDone"])

      const byRange = await call(seeded.store, listTasksTool, {from: "2026-03-01", to: "2026-03-02"})
      expect(byRange.tasks.map((t: any) => t.content).sort()).toEqual(["MainActive", "MainActiveOther", "MainDone"])

      const byMilestone = await call(seeded.store, listTasksTool, {milestoneId})
      expect(byMilestone.tasks.map((t: any) => t.content)).toEqual(["MainActive"])

      const byTag = await call(seeded.store, listTasksTool, {tagId})
      expect(byTag.tasks.map((t: any) => t.content)).toEqual(["MainActive"])

      const combined = await call(seeded.store, listTasksTool, {projectId: "main", status: "active", from: "2026-03-01", to: "2026-03-02"})
      expect(combined.tasks.map((t: any) => t.content).sort()).toEqual(["MainActive", "MainActiveOther"])
    } finally {
      seeded.close()
    }
  })

  it("TC-23: a search phrase returns matching tasks most relevant first, and leaves non-matching tasks out", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      await mac.core.tasksService.createTask(dated("2026-04-01", {content: "Renew the passport before the trip"}))
      await mac.core.tasksService.createTask(dated("2026-04-02", {content: "passport passport passport"}))
      await mac.core.tasksService.createTask(dated("2026-04-03", {content: "Buy milk"}))
    })

    try {
      const result = await call(seeded.store, listTasksTool, {search: "passport"})
      const contents = result.tasks.map((t: any) => t.content)

      expect(contents).toContain("Renew the passport before the trip")
      expect(contents).toContain("passport passport passport")
      expect(contents).not.toContain("Buy milk")
      expect(contents[0]).toBe("passport passport passport")
    } finally {
      seeded.close()
    }
  })

  it("TC-24: paging with a limit and its cursor covers the whole result once, in order, and the last page has no cursor", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      for (let i = 0; i < 5; i++) {
        await mac.core.tasksService.createTask(dated("2026-05-01", {content: `Task-${i}`, orderIndex: i * 100}))
      }
    })

    try {
      const firstPage = await call(seeded.store, listTasksTool, {limit: 2})
      expect(firstPage.tasks.map((t: any) => t.content)).toEqual(["Task-0", "Task-1"])
      expect(firstPage.nextCursor).toBeTruthy()

      const secondPage = await call(seeded.store, listTasksTool, {limit: 2, cursor: firstPage.nextCursor})
      expect(secondPage.tasks.map((t: any) => t.content)).toEqual(["Task-2", "Task-3"])
      expect(secondPage.nextCursor).toBeTruthy()

      const thirdPage = await call(seeded.store, listTasksTool, {limit: 2, cursor: secondPage.nextCursor})
      expect(thirdPage.tasks.map((t: any) => t.content)).toEqual(["Task-4"])
      expect(thirdPage.nextCursor).toBeNull()
    } finally {
      seeded.close()
    }
  })

  it("TC-25: a soft-deleted task is absent, and an image count drops a reference with no file row behind it", async () => {
    let file1 = ""

    const seeded = await seedAgentStore(async (mac) => {
      const deleted = await mac.core.tasksService.createTask(dated("2026-06-01", {content: "Gone"}))
      await mac.core.tasksService.deleteTask(deleted!.id)

      file1 = await mac.core.filesService.saveFile("one.png", makePngBytes())
      const file2 = await mac.core.filesService.saveFile("two.png", makePngBytes())
      const content = `Has images ![a](daily://file/${file1}) ![b](daily://file/${file2}) ![c](daily://file/no-such-file-id)`
      await mac.core.tasksService.createTask(dated("2026-06-02", {content}))
    })

    try {
      const result = await call(seeded.store, listTasksTool)
      const contents = result.tasks.map((t: any) => t.content)
      expect(contents).not.toContain("Gone")

      const withImages = result.tasks.find((t: any) => t.content.startsWith("Has images"))
      expect(withImages.imageCount).toBe(2)
      expect(withImages.imageData).toBeUndefined()
    } finally {
      seeded.close()
    }
  })

  it("TC-6: completedFrom/completedTo answer tasks whose completion fell in the window, whatever day they are scheduled on", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      const inWindow = await mac.core.tasksService.createTask(dated("2026-01-05", {content: "Completed in window"}))
      await mac.core.tasksService.updateTask(inWindow!.id, {status: "done"})
      stampCompletionCreatedAt(mac, inWindow!.id, "2026-09-21T10:00:00.000Z")

      const outOfWindow = await mac.core.tasksService.createTask(dated("2026-01-06", {content: "Completed out of window"}))
      await mac.core.tasksService.updateTask(outOfWindow!.id, {status: "done"})
      stampCompletionCreatedAt(mac, outOfWindow!.id, "2026-09-18T10:00:00.000Z")
    })

    try {
      const result = await call(seeded.store, listTasksTool, {completedFrom: "2026-09-21", completedTo: "2026-09-23"})
      expect(result.tasks.map((t: any) => t.content)).toEqual(["Completed in window"])
    } finally {
      seeded.close()
    }
  })

  it("TC-7: a task completed and later reopened still answers inside the completion window, with its real current status", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      const reopened = await mac.core.tasksService.createTask(dated("2026-01-05", {content: "Reopened"}))
      await mac.core.tasksService.updateTask(reopened!.id, {status: "done"})
      stampCompletionCreatedAt(mac, reopened!.id, "2026-09-21T10:00:00.000Z")
      await mac.core.tasksService.updateTask(reopened!.id, {status: "active"})

      const outOfWindow = await mac.core.tasksService.createTask(dated("2026-01-06", {content: "Outside the window"}))
      await mac.core.tasksService.updateTask(outOfWindow!.id, {status: "done"})
      stampCompletionCreatedAt(mac, outOfWindow!.id, "2026-09-18T10:00:00.000Z")
    })

    try {
      const result = await call(seeded.store, listTasksTool, {completedFrom: "2026-09-20", completedTo: "2026-09-22"})

      expect(result.tasks.map((t: any) => t.content)).toEqual(["Reopened"])
      expect(result.tasks[0].status).toBe("active")
    } finally {
      seeded.close()
    }
  })

  it("TC-8: a completion window's day boundary is taken in the agent Mac's own zone, not UTC", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      const early = await mac.core.tasksService.createTask(dated("2026-01-05", {content: "Early riser"}))
      await mac.core.tasksService.updateTask(early!.id, {status: "done"})
      stampCompletionCreatedAt(mac, early!.id, "2026-09-20T14:30:00.000Z")

      const dayEarlier = await mac.core.tasksService.createTask(dated("2026-01-06", {content: "A day earlier"}))
      await mac.core.tasksService.updateTask(dayEarlier!.id, {status: "done"})
      stampCompletionCreatedAt(mac, dayEarlier!.id, "2026-09-19T10:00:00.000Z")
    })

    try {
      const agent = bindAgent(seeded.store, "Vladivostok Mac", "Asia/Vladivostok")
      const result = await runInAgentWorkspace(
        {store: seeded.store},
        agent,
        listTasksTool.mode,
        (ctx) => listTasksTool.run({completedFrom: "2026-09-21", completedTo: "2026-09-21"}, ctx) as any,
      )

      expect(result.tasks.map((t: any) => t.content)).toEqual(["Early riser"])
    } finally {
      seeded.close()
    }
  })

  it("TC-10: minMovedCount answers only the tasks moved at least that many times, each carrying its own count", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      await mac.core.tasksService.createTask(dated("2026-02-01", {content: "Steady"}))

      const onceMoved = await mac.core.tasksService.createTask(dated("2026-02-01", {content: "OnceMoved"}))
      await mac.core.tasksService.updateTask(onceMoved!.id, {scheduled: {date: "2026-02-02", time: "09:00:00", timezone: "UTC"}})

      const thriceMoved = await mac.core.tasksService.createTask(dated("2026-02-01", {content: "ThriceMoved"}))
      await mac.core.tasksService.updateTask(thriceMoved!.id, {scheduled: {date: "2026-02-02", time: "09:00:00", timezone: "UTC"}})
      await mac.core.tasksService.updateTask(thriceMoved!.id, {scheduled: {date: "2026-02-03", time: "09:00:00", timezone: "UTC"}})
      await mac.core.tasksService.updateTask(thriceMoved!.id, {scheduled: {date: "2026-02-04", time: "09:00:00", timezone: "UTC"}})
    })

    try {
      const result = await call(seeded.store, listTasksTool, {minMovedCount: 2})

      expect(result.tasks.map((t: any) => t.content)).toEqual(["ThriceMoved"])
      expect(result.tasks[0].movedCount).toBe(3)
    } finally {
      seeded.close()
    }
  })

  it("TC-11: deleted: true answers the trash, and the same call without it does not", async () => {
    let deletedId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-03-01", {content: "Trashed"}))
      deletedId = task!.id
      await mac.core.tasksService.deleteTask(deletedId)
    })

    try {
      const trashed = await call(seeded.store, listTasksTool, {deleted: true})
      const found = trashed.tasks.find((t: any) => t.id === deletedId)
      expect(found).toBeTruthy()
      expect(found.deletedAt).toBeTruthy()

      const live = await call(seeded.store, listTasksTool)
      expect(live.tasks.some((t: any) => t.id === deletedId)).toBe(false)
    } finally {
      seeded.close()
    }
  })

  it("TC-12: deleted and status together refuse INVALID_INPUT", async () => {
    const seeded = await seedAgentStore()

    try {
      await expect(call(seeded.store, listTasksTool, {deleted: true, status: "active"})).rejects.toMatchObject({
        code: AgentToolErrorCode.INVALID_INPUT,
      })
    } finally {
      seeded.close()
    }
  })
})

describe("get_task", () => {
  it("TC-1: an edit made through save_task records an mcp event carrying the caller's own approved name", async () => {
    let taskId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Original"}))
      taskId = task!.id
    })

    try {
      await call(seeded.store, saveTaskTool, {id: taskId, content: "Edited"})
      const result = await call(seeded.store, getTaskTool, {id: taskId})

      const edited = result.history.find((e: any) => e.type === "edited")
      expect(edited.kind).toBe("mcp")
      expect(edited.provider).toBe("Test Client")
    } finally {
      seeded.close()
    }
  })

  it("TC-9: movedCount counts the collapsed moves a task carries, not the raw event rows", async () => {
    let taskId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-01-01", {content: "Wanderer"}))
      taskId = task!.id
      await mac.core.tasksService.updateTask(taskId, {scheduled: {date: "2026-01-02", time: "09:00:00", timezone: "UTC"}})
      await mac.core.tasksService.updateTask(taskId, {scheduled: {date: "2026-01-03", time: "09:00:00", timezone: "UTC"}})
      await mac.core.tasksService.updateTask(taskId, {scheduled: {date: "2026-01-04", time: "09:00:00", timezone: "UTC"}})
    })

    try {
      const result = await call(seeded.store, getTaskTool, {id: taskId})
      expect(result.movedCount).toBe(3)
    } finally {
      seeded.close()
    }
  })

  it("TC-26: answers every field, tags, milestone, both relation sides, history newest first, and both attachments", async () => {
    let taskId = ""
    let onServerFile = ""
    let offServerFile = ""
    let milestoneId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const milestone = await mac.core.milestonesService.createMilestone({
        branchId: "main",
        name: "M1",
        description: "",
        targetDate: null,
        deletedAt: null,
      })
      milestoneId = milestone!.id
      const tag = await mac.core.tagsService.createTag({branchId: "main", name: "urgent", color: "#ff0000", deletedAt: null})

      onServerFile = await mac.core.filesService.saveFile("on-server.png", makePngBytes())
      offServerFile = await mac.core.filesService.saveFile("off-server.png", makePngBytes(80))

      const blocker = await mac.core.tasksService.createTask(dated("2026-07-01", {content: "Blocker"}))
      const blocked = await mac.core.tasksService.createTask(dated("2026-07-02", {content: "Blocked"}))
      const task = await mac.core.tasksService.createTask(
        dated("2026-07-03", {
          content: `Main task ![on](${APP_CONFIG.filesProtocol}/${onServerFile}) ![off](${APP_CONFIG.filesProtocol}/${offServerFile})`,
          milestoneId: milestone!.id,
          tags: [tag],
        }),
      )
      taskId = task!.id

      await mac.core.taskRelationsService.setTaskRelations(taskId, {blockedBy: [blocker!.id], blocks: [blocked!.id]})
      await mac.core.tasksService.updateTask(taskId, {
        content: `Main task, edited ![on](${APP_CONFIG.filesProtocol}/${onServerFile}) ![off](${APP_CONFIG.filesProtocol}/${offServerFile})`,
      })
    })

    try {
      await putOnServer(seeded.store, onServerFile, "png", makePngBytes())

      const result = await call(seeded.store, getTaskTool, {id: taskId})

      expect(result.content).toBe(
        `Main task, edited ![on](${APP_CONFIG.filesProtocol}/${onServerFile}) ![off](${APP_CONFIG.filesProtocol}/${offServerFile})`,
      )
      expect(result.tags).toHaveLength(1)
      expect(result.tags[0].name).toBe("urgent")
      expect(result.milestoneId).toBe(milestoneId)
      expect(result.blockedBy.map((t: any) => t.content)).toEqual(["Blocker"])
      expect(result.blocks.map((t: any) => t.content)).toEqual(["Blocked"])
      expect(result.history[0].type).toBe("edited")
      expect(result.attachments).toHaveLength(2)

      const onServerAttachment = result.attachments.find((a: any) => a.id === onServerFile)
      const offServerAttachment = result.attachments.find((a: any) => a.id === offServerFile)
      expect(onServerAttachment.onServer).toBe(true)
      expect(offServerAttachment.onServer).toBe(false)
    } finally {
      seeded.close()
    }
  })

  it("TC-63: comments come with the task, oldest first, each carrying the channel and client it came through", async () => {
    let taskId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-07-03", {content: "Commented task"}))
      taskId = task!.id

      await mac.core.taskCommentsService.createComment(taskId, "typed by hand")
      await mac.core.taskCommentsService.createComment(taskId, "left by the built-in agent", {kind: "agent"})
      await mac.core.taskCommentsService.createComment(taskId, "sent through MCP", {kind: "mcp", provider: "Claude Code"})

      const gone = await mac.core.taskCommentsService.createComment(taskId, "withdrawn")
      await mac.core.taskCommentsService.deleteComment(gone!.id)
    })

    try {
      const result = await call(seeded.store, getTaskTool, {id: taskId})

      expect(result.comments.map((c: any) => c.content)).toEqual(["typed by hand", "left by the built-in agent", "sent through MCP"])
      expect(result.comments.map((c: any) => [c.kind, c.provider])).toEqual([
        ["manual", null],
        ["agent", "daily_agent"],
        ["mcp", "Claude Code"],
      ])
      expect(result.comments[0].id).toEqual(expect.any(String))
    } finally {
      seeded.close()
    }
  })

  it("TC-64: a task nobody has commented on answers an empty comment list rather than leaving the field out", async () => {
    let taskId = ""
    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-07-04", {content: "Quiet task"}))
      taskId = task!.id
    })

    try {
      const result = await call(seeded.store, getTaskTool, {id: taskId})
      expect(result.comments).toEqual([])
    } finally {
      seeded.close()
    }
  })

  it("TC-27: a soft-deleted task answers with its deletedAt, and an unknown id refuses NOT_FOUND", async () => {
    let deletedId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-08-01", {content: "Will be deleted"}))
      deletedId = task!.id
      await mac.core.tasksService.deleteTask(deletedId)
    })

    try {
      const deletedResult = await call(seeded.store, getTaskTool, {id: deletedId})
      expect(deletedResult.deletedAt).toBeTruthy()

      const agent = bindAgent(seeded.store)
      await expect(
        runInAgentWorkspace({store: seeded.store}, agent, "read", (ctx) => getTaskTool.run({id: "no-such-id"}, ctx) as any),
      ).rejects.toMatchObject({code: AgentToolErrorCode.NOT_FOUND})
    } finally {
      seeded.close()
    }
  })
})

describe("get_attachment", () => {
  it("TC-28: answers one image's bytes base64-encoded, with its name, type and size", async () => {
    let fileId = ""

    const seeded = await seedAgentStore(async (mac) => {
      fileId = await mac.core.filesService.saveFile("photo.png", makePngBytes(128))
      await mac.core.tasksService.createTask(dated("2026-09-01", {content: "Has a photo", attachments: [fileId]}))
    })

    try {
      await putOnServer(seeded.store, fileId, "png", makePngBytes(128))

      const result = await call(seeded.store, getAttachmentTool, {id: fileId})
      expect(result.id).toBe(fileId)
      expect(result.mimeType).toBe("image/png")
      expect(typeof result.dataBase64).toBe("string")
      expect(Buffer.from(result.dataBase64, "base64").length).toBe(result.size)
    } finally {
      seeded.close()
    }
  })

  it("TC-29: bytes not on the server, a non-image file, and an oversized image each refuse with their own code", async () => {
    let offServerId = ""
    let textFileId = ""
    let hugeId = ""

    const seeded = await seedAgentStore(async (mac) => {
      offServerId = await mac.core.filesService.saveFile("off-server.png", makePngBytes())
      textFileId = await mac.core.filesService.saveFile("notes.txt", Buffer.from("hello"))
      hugeId = await mac.core.filesService.saveFile("huge.png", makePngBytes(6 * 1024 * 1024))
    })

    try {
      await putOnServer(seeded.store, hugeId, "png", makePngBytes(6 * 1024 * 1024))

      const agent = bindAgent(seeded.store)
      const attempt = (id: string) => runInAgentWorkspace({store: seeded.store}, agent, "read", (ctx) => getAttachmentTool.run({id}, ctx) as any)

      await expect(attempt(offServerId)).rejects.toMatchObject({code: AgentToolErrorCode.ATTACHMENT_UNAVAILABLE})
      await expect(attempt(textFileId)).rejects.toMatchObject({code: AgentToolErrorCode.ATTACHMENT_NOT_AN_IMAGE})
      await expect(attempt(hugeId)).rejects.toMatchObject({code: AgentToolErrorCode.ATTACHMENT_TOO_LARGE})
    } finally {
      seeded.close()
    }
  })
})

describe("list_projects, list_milestones and list_tags", () => {
  it("TC-30: only live rows come back, milestones carry progress and closed state ordered open-first, and a project scopes milestones and tags", async () => {
    let projectAId = ""
    let projectBId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const projectA = await mac.core.branchesService.createBranch({name: "Project A"})
      const projectB = await mac.core.branchesService.createBranch({name: "Project B"})
      projectAId = projectA!.id
      projectBId = projectB!.id

      const deletedProject = await mac.core.branchesService.createBranch({name: "Deleted project"})
      await mac.core.branchesService.deleteBranch(deletedProject!.id)

      await mac.core.milestonesService.createMilestone({branchId: projectAId, name: "Open", description: "", targetDate: null, deletedAt: null})
      const closedMilestone = await mac.core.milestonesService.createMilestone({
        branchId: projectAId,
        name: "Closed",
        description: "",
        targetDate: null,
        deletedAt: null,
      })
      const closedTask = await mac.core.tasksService.createTask(dated("2026-10-01", {branchId: projectAId, milestoneId: closedMilestone!.id}))
      await mac.core.tasksService.updateTask(closedTask!.id, {status: "done"})

      await mac.core.milestonesService.createMilestone({
        branchId: projectBId,
        name: "B milestone",
        description: "",
        targetDate: null,
        deletedAt: null,
      })

      await mac.core.tagsService.createTag({branchId: projectAId, name: "a-tag", color: "#111111", deletedAt: null})
      await mac.core.tagsService.createTag({branchId: projectBId, name: "b-tag", color: "#222222", deletedAt: null})
    })

    try {
      const projects = await call(seeded.store, listProjectsTool)
      expect(projects.projects.map((p: any) => p.name)).toEqual(expect.arrayContaining(["Project A", "Project B", "Main"]))
      expect(projects.projects.map((p: any) => p.name)).not.toContain("Deleted project")

      const milestones = await call(seeded.store, listMilestonesTool, {projectId: projectAId})
      expect(milestones.milestones.map((m: any) => m.name)).toEqual(["Open", "Closed"])
      expect(milestones.milestones.find((m: any) => m.name === "Closed").isClosed).toBe(true)
      expect(milestones.milestones.find((m: any) => m.name === "Open").isClosed).toBe(false)

      const tagsA = await call(seeded.store, listTagsTool, {projectId: projectAId})
      expect(tagsA.tags.map((t: any) => t.name)).toEqual(["a-tag"])

      const tagsB = await call(seeded.store, listTagsTool, {projectId: projectBId})
      expect(tagsB.tags.map((t: any) => t.name)).toEqual(["b-tag"])

      const allMilestones = await call(seeded.store, listMilestonesTool)
      expect(allMilestones.milestones.map((m: any) => m.name).sort()).toEqual(["B milestone", "Closed", "Open"])
      expect(allMilestones.milestones.at(-1).name).toBe("Closed")

      const allTags = await call(seeded.store, listTagsTool)
      expect(allTags.tags.map((t: any) => t.name).sort()).toEqual(["a-tag", "b-tag"])
    } finally {
      seeded.close()
    }
  })
})
