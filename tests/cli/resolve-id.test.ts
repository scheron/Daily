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

describe("resolveTaskId", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("resolves an exact id", async () => {
    const t = await core.tasksService.createTask(base)
    expect(await cli.resolveTaskId(t.id, {})).toBe(t.id)
  })
  it("resolves a unique prefix within scope", async () => {
    const t = await core.tasksService.createTask(base)
    expect(await cli.resolveTaskId(t.id.slice(0, 4), {})).toBe(t.id)
  })
  it("throws TASK_NOT_FOUND when nothing matches", async () => {
    await expect(cli.resolveTaskId("zzzz", {})).rejects.toBeInstanceOf(CliError)
  })
})
