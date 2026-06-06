// @ts-nocheck
import {describe, expect, it} from "vitest"

import {buildMcpToolRegistry, MCP_BLOCKED_TOOL_NAMES} from "@main/mcp/tools/registry"

describe("MCP tool registry", () => {
  it("excludes all blocked tools", () => {
    const reg = buildMcpToolRegistry()
    const names = reg.list().map((t) => t.name)
    for (const blocked of MCP_BLOCKED_TOOL_NAMES) {
      expect(names).not.toContain(blocked)
    }
  })

  it("includes core read and write tools", () => {
    const reg = buildMcpToolRegistry()
    const names = reg.list().map((t) => t.name)
    for (const must of [
      "list_tasks",
      "create_task",
      "complete_task",
      "delete_task",
      "restore_task",
      "get_deleted_tasks",
      "list_projects",
      "list_tags",
    ]) {
      expect(names).toContain(must)
    }
  })

  it("each exposed tool has inputSchema with object type", () => {
    const reg = buildMcpToolRegistry()
    for (const tool of reg.list()) {
      expect(tool.inputSchema.type).toBe("object")
    }
  })

  it("has(name) reflects exclusion", () => {
    const reg = buildMcpToolRegistry()
    expect(reg.has("create_task")).toBe(true)
    expect(reg.has("permanently_delete_task")).toBe(false)
    expect(reg.has("unknown_tool")).toBe(false)
  })

  it("exposes 26 tools (30 total minus 4 blocked)", () => {
    const reg = buildMcpToolRegistry()
    expect(reg.list().length).toBe(26)
  })
})
