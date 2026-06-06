// @ts-nocheck
import {describe, expect, it} from "vitest"

import {SUMMARY_TOOLS} from "@main/ai/tools/registry/categories/summary"

describe("Summary tools registry", () => {
  it("exposes 1 summary tool", () => {
    expect(SUMMARY_TOOLS.length).toBe(1)
  })

  it("each has parameters.type === 'object'", () => {
    for (const t of SUMMARY_TOOLS) {
      expect(t.parameters.type).toBe("object")
    }
  })

  it("neither write nor destructive", () => {
    const writes = SUMMARY_TOOLS.filter((t) => t.isWrite).map((t) => t.name)
    const destructive = SUMMARY_TOOLS.filter((t) => t.isDestructive).map((t) => t.name)
    expect(writes).toEqual([])
    expect(destructive).toEqual([])
  })
})
