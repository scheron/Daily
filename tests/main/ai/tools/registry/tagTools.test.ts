// @ts-nocheck
import {describe, expect, it} from "vitest"

import {TAG_TOOLS} from "@main/ai/tools/registry/categories/tags"

describe("Tag tools registry", () => {
  it("exposes 7 tag tools", () => {
    expect(TAG_TOOLS.length).toBe(7)
  })

  it("each has parameters.type === 'object'", () => {
    for (const t of TAG_TOOLS) {
      expect(t.parameters.type).toBe("object")
    }
  })

  it("write tools are marked isWrite", () => {
    const writes = TAG_TOOLS.filter((t) => t.isWrite).map((t) => t.name)
    expect(writes.sort()).toEqual(["add_task_tags", "create_tag", "delete_tag", "remove_task_tags", "update_tag"].sort())
  })

  it("destructive tools are flagged", () => {
    const destructive = TAG_TOOLS.filter((t) => t.isDestructive).map((t) => t.name)
    expect(destructive.sort()).toEqual(["delete_tag"].sort())
  })
})
