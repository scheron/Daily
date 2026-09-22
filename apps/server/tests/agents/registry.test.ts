import {describe, expect, it} from "vitest"

import {runAgentTool} from "../../src/agents/runAgentTool"
import {AGENT_TOOLS} from "../../src/agents/tools"
import {AgentToolErrorCode} from "../../src/errors/agent/AgentToolErrorCode"
import {readRevision} from "../../src/snapshot/SnapshotStore"
import {bindAgent, seedAgentStore} from "./helpers"

describe("the agent tool registry", () => {
  it("TC-42: holds exactly the thirteen agent tools, once each, reads before writes, each with a name, a description and an object input schema", () => {
    expect(AGENT_TOOLS.map((tool) => tool.name)).toEqual([
      "list_tasks",
      "get_task",
      "get_attachment",
      "list_projects",
      "list_milestones",
      "list_tags",
      "save_task",
      "delete_task",
      "save_comment",
      "delete_comment",
      "save_project",
      "save_milestone",
      "save_tag",
    ])
    expect(new Set(AGENT_TOOLS.map((tool) => tool.name)).size).toBe(AGENT_TOOLS.length)

    for (const tool of AGENT_TOOLS) {
      expect(typeof tool.name).toBe("string")
      expect(typeof tool.description).toBe("string")
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema.type).toBe("object")
      expect(typeof tool.inputSchema.properties).toBe("object")
    }
  })
})

describe("runAgentTool", () => {
  it("TC-43: a call naming a tool that does not exist refuses UNKNOWN_TOOL, and the stored revision is unchanged", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)
      const outcome = await runAgentTool({store: seeded.store}, agent, {name: "not_a_real_tool", input: {}})

      expect(outcome).toEqual({ok: false, error: {code: AgentToolErrorCode.UNKNOWN_TOOL, message: expect.any(String)}})
      expect(readRevision(seeded.store)).toBe(seeded.revision)
    } finally {
      seeded.close()
    }
  })

  it("TC-44: save_task with neither content nor id, save_task with an id and time: null, and get_task with a number for an id all refuse INVALID_INPUT naming the field, revision unchanged", async () => {
    let taskId = ""
    const seeded = await seedAgentStore(async (mac) => {
      const task = await mac.core.tasksService.createTask({
        content: "Existing",
        status: "active",
        minimized: false,
        orderIndex: 1,
        scheduled: {date: "2026-01-01", time: "09:00:00", timezone: "UTC"},
        estimatedTime: 0,
        spentTime: 0,
        branchId: "main",
        milestoneId: null,
        tags: [],
        attachments: [],
        deletedAt: null,
      } as any)
      taskId = task!.id
    })

    try {
      const agent = bindAgent(seeded.store)

      const missingBoth = await runAgentTool({store: seeded.store}, agent, {name: "save_task", input: {}})
      expect(missingBoth.ok).toBe(false)
      if (!missingBoth.ok) {
        expect(missingBoth.error.code).toBe(AgentToolErrorCode.INVALID_INPUT)
        expect(missingBoth.error.message).toContain("content")
      }

      const nullTime = await runAgentTool({store: seeded.store}, agent, {name: "save_task", input: {id: taskId, time: null}})
      expect(nullTime.ok).toBe(false)
      if (!nullTime.ok) {
        expect(nullTime.error.code).toBe(AgentToolErrorCode.INVALID_INPUT)
        expect(nullTime.error.message).toContain("time")
      }

      const numericId = await runAgentTool({store: seeded.store}, agent, {name: "get_task", input: {id: 12345}})
      expect(numericId.ok).toBe(false)
      if (!numericId.ok) {
        expect(numericId.error.code).toBe(AgentToolErrorCode.INVALID_INPUT)
        expect(numericId.error.message).toContain("id")
      }

      expect(readRevision(seeded.store)).toBe(seeded.revision)
    } finally {
      seeded.close()
    }
  })
})
