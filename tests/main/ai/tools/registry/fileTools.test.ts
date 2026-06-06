// @ts-nocheck
import {describe, expect, it} from "vitest"

import {FILE_TOOLS} from "@main/ai/tools/registry/categories/files"

describe("File tools registry", () => {
  it("exposes 2 file tools", () => {
    expect(FILE_TOOLS.length).toBe(2)
  })

  it("each has parameters.type === 'object'", () => {
    for (const t of FILE_TOOLS) {
      expect(t.parameters.type).toBe("object")
    }
  })

  it("write tools are marked isWrite", () => {
    const writes = FILE_TOOLS.filter((t) => t.isWrite).map((t) => t.name)
    expect(writes.sort()).toEqual(["remove_task_attachment"].sort())
  })

  it("destructive tools are flagged", () => {
    const destructive = FILE_TOOLS.filter((t) => t.isDestructive).map((t) => t.name)
    expect(destructive.sort()).toEqual(["remove_task_attachment"].sort())
  })
})
