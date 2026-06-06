// @ts-nocheck
import {describe, expect, it} from "vitest"

import {AI_TOOLS, AI_TOOLS_COMPACT, getRegisteredTool, REGISTRY} from "@main/ai/tools/registry"
import {MCP_BLOCKED_TOOL_NAMES, MCP_HIDDEN_TOOL_NAMES} from "@main/mcp/constants"
import {buildMcpToolRegistry} from "@main/mcp/tools/registry"

describe("Tool registry invariants", () => {
  it("contains exactly 31 tools (30 domain + respond meta)", () => {
    expect(REGISTRY.length).toBe(31)
  })

  it("includes the respond meta tool with non-destructive flags", () => {
    const respond = REGISTRY.find((t) => t.name === "respond")
    expect(respond).toBeDefined()
    expect(respond?.isWrite).toBe(false)
    expect(respond?.isDestructive).toBe(false)
    expect(respond?.parameters.required).toContain("text")
  })

  it("all tool names are unique", () => {
    const names = REGISTRY.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("AI_TOOLS mirrors registry size", () => {
    expect(AI_TOOLS.length).toBe(REGISTRY.length)
    expect(AI_TOOLS_COMPACT.length).toBe(REGISTRY.length)
  })

  it("every tool has parameters.type === 'object'", () => {
    for (const t of REGISTRY) expect(t.parameters.type).toBe("object")
  })

  it("getRegisteredTool returns entry for every name", () => {
    for (const t of REGISTRY) {
      expect(getRegisteredTool(t.name)).toBe(t)
    }
  })

  it("getRegisteredTool returns undefined for unknown names", () => {
    expect(getRegisteredTool("nonexistent")).toBeUndefined()
  })

  it("MCP blocked tool names all exist in the registry", () => {
    for (const name of MCP_BLOCKED_TOOL_NAMES) {
      expect(getRegisteredTool(name), `blocked tool ${name} not in registry`).toBeDefined()
    }
  })

  it("every MCP-blocked tool is marked isDestructive", () => {
    for (const name of MCP_BLOCKED_TOOL_NAMES) {
      const t = getRegisteredTool(name)
      expect(t?.isDestructive, `${name} should be isDestructive`).toBe(true)
    }
  })

  it("MCP-hidden tools (respond, etc) are non-destructive protocol tools", () => {
    for (const name of MCP_HIDDEN_TOOL_NAMES) {
      const t = getRegisteredTool(name)
      expect(t, `hidden tool ${name} not in registry`).toBeDefined()
      expect(t?.isDestructive, `${name} should not be isDestructive`).toBe(false)
    }
  })

  it("buildMcpToolRegistry excludes both blocked and hidden tools", () => {
    const mcp = buildMcpToolRegistry()
    const exposedNames = new Set(mcp.list().map((t) => t.name))
    for (const name of MCP_BLOCKED_TOOL_NAMES) expect(exposedNames.has(name), `blocked ${name} should not be exposed`).toBe(false)
    for (const name of MCP_HIDDEN_TOOL_NAMES) expect(exposedNames.has(name), `hidden ${name} should not be exposed`).toBe(false)
  })
})
