// @ts-nocheck
import {describe, expect, it} from "vitest"

import {TASK_TOOLS} from "@main/ai/tools/registry/categories/tasks"

describe("Task tools registry", () => {
  it("exposes 14 task tools", () => {
    expect(TASK_TOOLS.length).toBe(14)
  })

  it("each has parameters.type === 'object'", () => {
    for (const t of TASK_TOOLS) {
      expect(t.parameters.type).toBe("object")
    }
  })

  it("write tools are marked isWrite", () => {
    const writes = TASK_TOOLS.filter((t) => t.isWrite).map((t) => t.name)
    expect(writes.sort()).toEqual(
      [
        "complete_task",
        "create_task",
        "delete_task",
        "discard_task",
        "log_time",
        "move_task",
        "permanently_delete_task",
        "reactivate_task",
        "restore_task",
        "update_task",
      ].sort(),
    )
  })

  it("destructive tools are flagged", () => {
    const destructive = TASK_TOOLS.filter((t) => t.isDestructive).map((t) => t.name)
    expect(destructive.sort()).toEqual(["delete_task", "permanently_delete_task"].sort())
  })
})
