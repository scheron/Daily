// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {CliController} from "@cli/CliController"
import {createStorageCore} from "@main/storage/createStorageCore"
import {createTestDatabase} from "../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {}},
}))
const paths = {
  appDataRoot: () => "/tmp/d",
  dbPath: () => "/tmp/d/db",
  assetsDir: () => "/tmp/d/a",
  remoteSyncPath: () => "/tmp/d/r",
  mutationSignalPath: () => "/tmp/d/.s",
}

describe("searchTasks", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("finds a task by content, building the index lazily", async () => {
    await core.tasksService.createTask({
      id: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      branchId: "main",
      scheduled: {date: "2026-07-10", time: "", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      content: "Review pull request",
      minimized: false,
      orderIndex: 1,
      status: "active",
      tags: [],
      attachments: [],
    })
    const results = await cli.searchTasks("pull request")
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].task.content).toContain("pull request")
  })
})
