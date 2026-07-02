// @ts-nocheck
import {describe, expect, it} from "vitest"

import {AI_TOOLS, AI_TOOLS_COMPACT, getRegisteredTool, REGISTRY} from "@main/ai/tools/registry"

describe("Tool registry invariants", () => {
  it("contains exactly 32 tools (31 domain + respond meta)", () => {
    expect(REGISTRY.length).toBe(32)
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
})
