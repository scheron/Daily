// @ts-nocheck
import {describe, expect, it} from "vitest"

import {TOOLS} from "@daily/tools"

import {AI_TOOLS, getRegisteredTool, REGISTRY} from "../../../../../src/main/ai/tools/registry"

describe("Tool registry invariants", () => {
  it("is exactly respond, read_url and @daily/tools' own eighteen, in that order", () => {
    expect(REGISTRY.map((t) => t.name)).toEqual(["respond", ...TOOLS.map((t) => t.name), "read_url"])
  })

  it("includes the respond meta tool with non-destructive flags", () => {
    const respond = REGISTRY.find((t) => t.name === "respond")
    expect(respond).toBeDefined()
    expect(respond?.isWrite).toBe(false)
    expect(respond?.isDestructive).toBe(false)
    expect(respond?.parameters.required).toContain("text")
  })

  it("marks every shared delete_ tool as destructive and no other shared tool as destructive", () => {
    for (const t of REGISTRY) {
      if (t.name === "respond" || t.name === "read_url") continue
      expect(t.isDestructive, t.name).toBe(t.name.startsWith("delete_"))
    }
  })

  it("all tool names are unique", () => {
    const names = REGISTRY.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("AI_TOOLS mirrors registry size", () => {
    expect(AI_TOOLS.length).toBe(REGISTRY.length)
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
