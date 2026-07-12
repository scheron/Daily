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
  mutationSignalPath: () => "/tmp/daily-mutate-signal",
}
const base = {
  id: "",
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
  branchId: "main",
  scheduled: {date: "2026-07-10", time: "09:00:00", timezone: "UTC"},
  estimatedTime: 0,
  spentTime: 0,
  content: "T",
  minimized: false,
  orderIndex: 1,
  status: "active",
  tags: [],
  attachments: [],
}

describe("logTime / moveTask / updateTaskFields", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("accumulates spent time", async () => {
    const t = await core.tasksService.createTask(base)
    await cli.logTime(t.id, 15, {})
    expect((await cli.logTime(t.id, 15, {})).spentTime).toBe(1800)
  })
  it("moves to a new date keeping the time", async () => {
    const t = await core.tasksService.createTask(base)
    const moved = await cli.moveTask(t.id, {date: "2026-07-12"}, {})
    expect(moved.scheduled.date).toBe("2026-07-12")
    expect(moved.scheduled.time).toBe("09:00:00")
  })
  it("updates content and estimate", async () => {
    const t = await core.tasksService.createTask(base)
    const up = await cli.updateTaskFields(t.id, {content: "New", estimateMinutes: 10}, {})
    expect(up.content).toBe("New")
    expect(up.estimatedTime).toBe(600)
  })
})
