// @ts-nocheck
import {describe, expect, it} from "vitest"

import {PROJECT_TOOLS} from "@main/ai/tools/registry/categories/projects"

describe("Project tools registry", () => {
  it("exposes 6 project tools", () => {
    expect(PROJECT_TOOLS.length).toBe(6)
  })

  it("each has parameters.type === 'object'", () => {
    for (const t of PROJECT_TOOLS) {
      expect(t.parameters.type).toBe("object")
    }
  })

  it("write tools are marked isWrite", () => {
    const writes = PROJECT_TOOLS.filter((t) => t.isWrite).map((t) => t.name)
    expect(writes.sort()).toEqual(["create_project", "rename_project", "delete_project", "switch_project", "move_task_to_project"].sort())
  })

  it("destructive tools are flagged", () => {
    const destructive = PROJECT_TOOLS.filter((t) => t.isDestructive).map((t) => t.name)
    expect(destructive.sort()).toEqual(["delete_project"].sort())
  })
})
