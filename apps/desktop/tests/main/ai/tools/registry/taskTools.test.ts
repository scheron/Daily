// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {TASK_TOOLS} from "@main/ai/tools/registry/categories/tasks"
import {ToolExecutor} from "@main/ai/tools/ToolExecutor"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

function fakeTask(overrides = {}) {
  return {
    id: "t1",
    status: "active",
    content: "x",
    minimized: false,
    orderIndex: 1,
    scheduled: null,
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    tags: [],
    attachments: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("Task tools registry", () => {
  it("exposes 16 task tools", () => {
    expect(TASK_TOOLS.length).toBe(16)
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
        "move_task_to_backlog",
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

describe("Backlog task tools (execute)", () => {
  it("TC-30: get_backlog returns unscheduled tasks and does not read the day list", async () => {
    const fakeStorage = {
      getBacklogList: vi.fn(async () => [fakeTask({id: "b1"})]),
    }
    const exec = new ToolExecutor(fakeStorage as any)

    const r = await exec.execute("get_backlog" as any, {}, "in-app")

    expect(r.success).toBe(true)
    expect(fakeStorage.getBacklogList).toHaveBeenCalled()
  })

  it("TC-31: move_task_to_backlog clears the schedule and reports success", async () => {
    const fakeStorage = {
      moveTaskToBacklog: vi.fn(async (id) => fakeTask({id})),
    }
    const exec = new ToolExecutor(fakeStorage as any)

    const r = await exec.execute("move_task_to_backlog" as any, {task_id: "t1"}, "in-app")

    expect(r.success).toBe(true)
    expect(fakeStorage.moveTaskToBacklog).toHaveBeenCalledWith("t1")
  })

  it("TC-32: move_task on a backlog task schedules it onto the given date instead of being rejected", async () => {
    const fakeStorage = {
      scheduleTask: vi.fn(async (id, schedule) => fakeTask({id, scheduled: schedule})),
    }
    const exec = new ToolExecutor(fakeStorage as any)

    const r = await exec.execute("move_task" as any, {task_id: "t1", date: "2026-08-01"}, "in-app")

    expect(r.success).toBe(true)
    expect(fakeStorage.scheduleTask).toHaveBeenCalledWith("t1", expect.objectContaining({date: "2026-08-01"}))
  })
})
