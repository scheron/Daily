import {Readable} from "node:stream"
import {DateTime} from "luxon"
import {describe, expect, it} from "vitest"

import {callMcpTool, listMcpTools} from "../../../src/agents/mcp/mcpTools"
import {runAgentTool} from "../../../src/agents/runAgentTool"
import {AGENT_TOOLS} from "../../../src/agents/tools"
import {writeAsset} from "../../../src/assets/AssetStore"
import {bindAgent, bindDevice, makePngBytes, makeTaskDraft, seedAgentStore} from "../helpers"

import type {McpCaller, McpContent} from "../../../src/agents/mcp/mcpTools"
import type {ServerStore} from "../../../src/store/instance"

function dated(date: string, overrides: Record<string, unknown> = {}): any {
  return makeTaskDraft({scheduled: {date, time: "09:00:00", timezone: "UTC"}, ...overrides})
}

function textOf(content: McpContent[]): string {
  const [block] = content
  if (!block || block.type !== "text") throw new Error("expected one text content block")
  return block.text
}

function putOnServer(store: ServerStore, fileId: string, ext: string, bytes: Buffer): Promise<unknown> {
  const deviceId = bindDevice(store, "Uploader Mac")
  return writeAsset(store, `${fileId}.${ext}`, Readable.from(bytes), deviceId, 10 * 1024 * 1024)
}

describe("listMcpTools — TC-14", () => {
  it("TC-14: answers AGENT_TOOLS's own fifteen entries in order, with readOnlyHint true for reads and false for writes", () => {
    const result = listMcpTools()

    expect(result).toHaveLength(15)
    expect(result.map((tool) => tool.name)).toEqual(AGENT_TOOLS.map((tool) => tool.name))

    AGENT_TOOLS.forEach((tool, index) => {
      expect(result[index]).toEqual({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {readOnlyHint: tool.mode === "read"},
      })
    })
  })
})

describe("callMcpTool over a read — TC-15", () => {
  it("TC-15: a successful read answers one text block whose JSON is exactly runAgentTool's own answer for the same call", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      await mac.core.tasksService.createTask(dated("2026-03-25", {content: "25th"}))
      await mac.core.tasksService.createTask(dated("2026-03-24", {content: "24th"}))
    })

    try {
      const agent = bindAgent(seeded.store, "Agent Mac", "Asia/Tokyo")
      const caller: McpCaller = {deviceId: agent.deviceId, timeZone: agent.timeZone, name: agent.name}

      const reference = await runAgentTool({store: seeded.store}, agent, {name: "list_tasks", input: {date: "2026-03-25"}})
      if (!reference.ok) throw new Error("expected the reference call to succeed")

      const outcome = await callMcpTool({store: seeded.store}, caller, {name: "list_tasks", arguments: {date: "2026-03-25"}})
      if (!outcome.ok) throw new Error("expected callMcpTool to succeed")

      expect(outcome.result.isError).toBeUndefined()
      expect(outcome.result.content).toHaveLength(1)
      expect(outcome.result.content[0].type).toBe("text")

      const parsed = JSON.parse(textOf(outcome.result.content))
      expect(parsed).toEqual(reference.data)
      expect(parsed.tasks.map((task: {content: string}) => task.content)).toEqual(["25th"])
    } finally {
      seeded.close()
    }
  })
})

describe("callMcpTool over a write — TC-16", () => {
  it("TC-16: a successful write moves the stored revision forward, attributed to the caller's Mac, and answers the task it created on that Mac's today", async () => {
    const seeded = await seedAgentStore()
    expect(seeded.revision).toBe("1")

    try {
      const m = bindAgent(seeded.store, "M", "Pacific/Auckland")
      const caller: McpCaller = {deviceId: m.deviceId, timeZone: m.timeZone, name: m.name}

      const outcome = await callMcpTool({store: seeded.store}, caller, {name: "save_task", arguments: {content: "Buy milk"}})
      if (!outcome.ok) throw new Error("expected save_task to succeed")
      expect(outcome.result.isError).toBeUndefined()

      const parsed = JSON.parse(textOf(outcome.result.content))
      expect(parsed.task.projectId).toBe("main")
      expect(parsed.task.scheduled.timezone).toBe("Pacific/Auckland")
      expect(parsed.task.scheduled.date).toBe(DateTime.now().setZone("Pacific/Auckland").toISODate())

      const row = seeded.store.db.prepare(`SELECT revision, written_by_device_id FROM snapshot`).get() as {
        revision: number
        written_by_device_id: string
      }
      expect(String(row.revision)).toBe("2")
      expect(row.written_by_device_id).toBe(m.deviceId)
    } finally {
      seeded.close()
    }
  })
})

describe("callMcpTool's get_attachment — TC-17", () => {
  it("TC-17: answers exactly one image content block, no text block and no isError", async () => {
    let fileId = ""

    const seeded = await seedAgentStore(async (mac) => {
      fileId = await mac.core.filesService.saveFile("photo.png", makePngBytes(128))
      await mac.core.tasksService.createTask(dated("2026-04-01", {content: "Has a photo", attachments: [fileId]}))
    })

    try {
      await putOnServer(seeded.store, fileId, "png", makePngBytes(128))

      const agent = bindAgent(seeded.store)
      const caller: McpCaller = {deviceId: agent.deviceId, timeZone: agent.timeZone, name: agent.name}

      const outcome = await callMcpTool({store: seeded.store}, caller, {name: "get_attachment", arguments: {id: fileId}})
      if (!outcome.ok) throw new Error("expected get_attachment to succeed")

      expect(outcome.result.isError).toBeUndefined()
      expect(outcome.result.content).toHaveLength(1)
      const [block] = outcome.result.content
      expect(block.type).toBe("image")
      if (block.type !== "image") throw new Error("unreachable")
      expect(block.mimeType).toBe("image/png")
      expect(Buffer.from(block.data, "base64")).toEqual(makePngBytes(128))
    } finally {
      seeded.close()
    }
  })
})

describe("a tool's own refusal is an isError result, not a protocol error — TC-18", () => {
  it("TC-18: get_task's NOT_FOUND and list_tasks's INVALID_INPUT both land as isError results carrying runAgentTool's own code and message", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)
      const caller: McpCaller = {deviceId: agent.deviceId, timeZone: agent.timeZone, name: agent.name}

      const notFoundReference = await runAgentTool({store: seeded.store}, agent, {name: "get_task", input: {id: "nope"}})
      const notFoundOutcome = await callMcpTool({store: seeded.store}, caller, {name: "get_task", arguments: {id: "nope"}})
      if (notFoundReference.ok || !notFoundOutcome.ok) throw new Error("expected get_task to refuse both ways")
      expect(notFoundOutcome.result.isError).toBe(true)
      expect(JSON.parse(textOf(notFoundOutcome.result.content))).toEqual({error: {code: "NOT_FOUND", message: notFoundReference.error.message}})

      const invalidReference = await runAgentTool({store: seeded.store}, agent, {name: "list_tasks", input: {limit: "ten"}})
      const invalidOutcome = await callMcpTool({store: seeded.store}, caller, {name: "list_tasks", arguments: {limit: "ten"}})
      if (invalidReference.ok || !invalidOutcome.ok) throw new Error("expected list_tasks to refuse both ways")
      expect(invalidOutcome.result.isError).toBe(true)
      expect(JSON.parse(textOf(invalidOutcome.result.content))).toEqual({error: {code: "INVALID_INPUT", message: invalidReference.error.message}})
    } finally {
      seeded.close()
    }
  })
})

describe("a malformed call is a protocol error, never a tool result — TC-19", () => {
  it("TC-19: null params, an object with no name, an unknown tool and arguments that are an array or a string are all -32602; a null or an absent arguments both default to {}", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)
      const caller: McpCaller = {deviceId: agent.deviceId, timeZone: agent.timeZone, name: agent.name}

      const refusals: unknown[] = [null, {}, {name: "drop_database"}, {name: "list_projects", arguments: []}, {name: "list_projects", arguments: "x"}]

      for (const [index, params] of refusals.entries()) {
        const outcome = await callMcpTool({store: seeded.store}, caller, params)
        expect(outcome.ok).toBe(false)
        if (outcome.ok) throw new Error("unreachable")
        expect(outcome.error.code).toBe(-32602)
        if (index === 2) expect(outcome.error.message).toBe("Unknown tool: drop_database")
      }

      const reference = await runAgentTool({store: seeded.store}, agent, {name: "list_projects", input: {}})
      if (!reference.ok) throw new Error("expected the reference list_projects call to succeed")

      const nullArguments = await callMcpTool({store: seeded.store}, caller, {name: "list_projects", arguments: null})
      expect(nullArguments.ok).toBe(true)
      if (!nullArguments.ok) throw new Error("unreachable")
      expect(nullArguments.result.isError).toBeUndefined()
      expect(JSON.parse(textOf(nullArguments.result.content))).toEqual(reference.data)

      const noArguments = await callMcpTool({store: seeded.store}, caller, {name: "list_projects"})
      expect(noArguments.ok).toBe(true)
      if (!noArguments.ok) throw new Error("unreachable")
      expect(noArguments.result.isError).toBeUndefined()
      expect(JSON.parse(textOf(noArguments.result.content))).toEqual(reference.data)
    } finally {
      seeded.close()
    }
  })
})

describe("no time zone on record refuses every call before any clock is built — TC-20", () => {
  it("TC-20: a read and a write both answer the MAC_TIME_ZONE_UNKNOWN result with nothing written, but an unknown tool is still refused as a protocol error first", async () => {
    const seeded = await seedAgentStore()
    expect(seeded.revision).toBe("1")

    try {
      const deviceId = bindDevice(seeded.store, "Zoneless Mac")
      const caller: McpCaller = {deviceId, timeZone: null, name: "Test Client"}
      const message =
        "This agent's Mac has not told the server its time zone yet, so the server cannot tell which day it is there. Open Daily on that Mac and let it sync once, then try again."

      const listOutcome = await callMcpTool({store: seeded.store}, caller, {name: "list_projects"})
      if (!listOutcome.ok) throw new Error("expected list_projects to answer an ok isError result")
      expect(listOutcome.result.isError).toBe(true)
      expect(JSON.parse(textOf(listOutcome.result.content))).toEqual({error: {code: "MAC_TIME_ZONE_UNKNOWN", message}})

      const saveOutcome = await callMcpTool({store: seeded.store}, caller, {name: "save_task", arguments: {content: "x"}})
      if (!saveOutcome.ok) throw new Error("expected save_task to answer an ok isError result")
      expect(saveOutcome.result.isError).toBe(true)
      expect(JSON.parse(textOf(saveOutcome.result.content))).toEqual({error: {code: "MAC_TIME_ZONE_UNKNOWN", message}})

      const row = seeded.store.db.prepare(`SELECT revision FROM snapshot`).get() as {revision: number}
      expect(String(row.revision)).toBe("1")

      const dropOutcome = await callMcpTool({store: seeded.store}, caller, {name: "drop_database"})
      expect(dropOutcome).toEqual({ok: false, error: {code: -32602, message: "Unknown tool: drop_database"}})
    } finally {
      seeded.close()
    }
  })
})
