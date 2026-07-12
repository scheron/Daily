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
  mutationSignalPath: () => "/tmp/daily-status-signal",
}
const base = {
  id: "",
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
  branchId: "main",
  scheduled: {date: "2026-07-10", time: "", timezone: "UTC"},
  estimatedTime: 0,
  spentTime: 0,
  content: "T",
  minimized: false,
  orderIndex: 1,
  status: "active",
  tags: [],
  attachments: [],
}

describe("setStatus", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("marks a task done, then reactivates it, then discards it", async () => {
    const t = await core.tasksService.createTask(base)
    expect((await cli.setStatus(t.id, "done", {})).status).toBe("done")
    expect((await cli.setStatus(t.id.slice(0, 4), "active", {})).status).toBe("active")
    expect((await cli.setStatus(t.id, "discarded", {})).status).toBe("discarded")
  })
})
