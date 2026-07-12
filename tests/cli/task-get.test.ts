// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {CliError} from "@shared/errors/cli/CliError"

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

describe("getTaskExact", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("returns a task by full id", async () => {
    const created = await core.tasksService.createTask({
      id: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      branchId: "main",
      scheduled: {date: "2026-07-10", time: "", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      content: "hi",
      minimized: false,
      orderIndex: 1,
      status: "active",
      tags: [],
      attachments: [],
    })
    expect((await cli.getTaskExact(created.id)).content).toBe("hi")
  })
  it("throws TASK_NOT_FOUND for a missing id", async () => {
    await expect(cli.getTaskExact("does-not-exist")).rejects.toBeInstanceOf(CliError)
  })
})

describe("getTask", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("returns a task by unique prefix", async () => {
    const created = await core.tasksService.createTask({
      id: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      branchId: "main",
      scheduled: {date: "2026-07-10", time: "", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      content: "prefix",
      minimized: false,
      orderIndex: 1,
      status: "active",
      tags: [],
      attachments: [],
    })
    expect((await cli.getTask(created.id.slice(0, 4), {})).content).toBe("prefix")
  })
})
