import {describe, expect, it} from "vitest"

import {runInAgentWorkspace} from "../../src/agents/AgentWorkspace"
import {getAttachmentTool} from "../../src/agents/tools/read/getAttachment"
import {getTaskTool} from "../../src/agents/tools/read/getTask"
import {listTasksTool} from "../../src/agents/tools/read/listTasks"
import {saveAttachmentTool} from "../../src/agents/tools/write/saveAttachment"
import {saveTaskTool} from "../../src/agents/tools/write/saveTask"
import {bindAgent, makePngBytes, makeTaskDraft, seedAgentStore} from "./helpers"

import type {AgentIdentity, AgentWorkspaceDeps} from "../../src/agents/AgentWorkspace"
import type {AgentTool} from "../../src/agents/tools/types"

function call(deps: AgentWorkspaceDeps, agent: AgentIdentity, tool: AgentTool, input: Record<string, unknown> = {}): Promise<any> {
  return runInAgentWorkspace(deps, agent, tool.mode, (ctx) => tool.run(input, ctx) as any)
}

function dated(date: string, overrides: Record<string, unknown> = {}) {
  return makeTaskDraft({scheduled: {date, time: "09:00:00", timezone: "UTC"}, ...overrides})
}

describe("save_task and list_tasks", () => {
  it("TC-16: an order set through save_task is the order list_tasks answers", async () => {
    let firstId = ""
    let secondId = ""
    let thirdId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const first = await mac.core.tasksService.createTask(dated("2026-04-01", {content: "First", orderIndex: 100}))
      const second = await mac.core.tasksService.createTask(dated("2026-04-01", {content: "Second", orderIndex: 200}))
      const third = await mac.core.tasksService.createTask(dated("2026-04-01", {content: "Third", orderIndex: 300}))
      firstId = first!.id
      secondId = second!.id
      thirdId = third!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      await call({store: seeded.store}, agent, saveTaskTool, {id: thirdId, afterTaskId: firstId})

      const result = await call({store: seeded.store}, agent, listTasksTool, {date: "2026-04-01"})
      expect(result.tasks.map((t: any) => t.id)).toEqual([firstId, thirdId, secondId])
    } finally {
      seeded.close()
    }
  })
})

describe("save_attachment, save_task, get_attachment and get_task", () => {
  it("TC-21: an attachment saved through save_attachment and linked into a task's content by save_task is byte-identical through get_attachment and shown on the server through get_task", async () => {
    let taskId = ""

    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask(dated("2026-05-01", {content: "Needs a photo"}))
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store)
      const bytes = makePngBytes(128)

      const saved = await call({store: seeded.store}, agent, saveAttachmentTool, {name: "photo.png", dataBase64: bytes.toString("base64")})

      const written = await call({store: seeded.store}, agent, saveTaskTool, {
        id: taskId,
        content: `Needs a photo ![photo](${saved.url})`,
      })

      expect(written.task.imageCount).toBe(1)

      const attachment = await call({store: seeded.store}, agent, getAttachmentTool, {id: saved.id})
      expect(Buffer.from(attachment.dataBase64, "base64").equals(bytes)).toBe(true)

      const detail = await call({store: seeded.store}, agent, getTaskTool, {id: taskId})
      const onTask = detail.attachments.find((a: any) => a.id === saved.id)
      expect(onTask.onServer).toBe(true)
    } finally {
      seeded.close()
    }
  })
})
