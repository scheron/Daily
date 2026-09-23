// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {APP_CONFIG} from "@daily/protocol"

import {FILE_TOOLS} from "../../../../../src/main/ai/tools/registry/categories/files"
import {ToolExecutor} from "../../../../../src/main/ai/tools/ToolExecutor"

function makeTask(overrides = {}) {
  return {
    id: "t1",
    status: "active",
    content: "Task",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
    estimatedTime: 0,
    spentTime: 0,
    branchId: "P",
    milestoneId: null,
    tags: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeStorage(overrides = {}) {
  return {
    getTask: vi.fn(async () => null),
    getFiles: vi.fn(async () => []),
    ...overrides,
  }
}

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

  it("lists_TC-10_a_file_the_tasks_text_links_to_without_reading_the_tasks_attachments_field", async () => {
    const fileId = "DF-abc123"
    const task = makeTask({content: `Shot ![shot](${APP_CONFIG.filesProtocol}/${fileId})`, attachments: []})
    const storage = makeStorage({
      getTask: vi.fn(async (id) => (id === "t1" ? task : null)),
      getFiles: vi.fn(async () => [{id: fileId, name: "shot.png", mimeType: "image/png", size: 2048}]),
    })

    const result = await new ToolExecutor(storage).execute("get_task_attachments", {task_id: "t1"}, "in-app")

    expect(result.success).toBe(true)
    expect(result.data).toContain("shot.png")
    expect(storage.getFiles).toHaveBeenCalledWith([fileId])
  })
})
