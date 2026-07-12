// @ts-nocheck
import {DateTime} from "luxon"
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

function seedTask(core, over = {}) {
  return core.tasksService.createTask({
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
    ...over,
  })
}

describe("listTasks", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("defaults to today's tasks in the active branch", async () => {
    const today = DateTime.now().toISODate()
    await seedTask(core, {content: "Today", scheduled: {date: today, time: "", timezone: "UTC"}})
    await seedTask(core, {content: "Old", scheduled: {date: "2000-01-01", time: "", timezone: "UTC"}})
    const tasks = await cli.listTasks({})
    expect(tasks.map((t) => t.content)).toEqual(["Today"])
  })

  it("filters by explicit date within the active branch", async () => {
    await seedTask(core, {content: "A", scheduled: {date: "2026-07-10", time: "", timezone: "UTC"}})
    await seedTask(core, {content: "B", scheduled: {date: "2026-07-11", time: "", timezone: "UTC"}})
    const tasks = await cli.listTasks({date: "2026-07-10"})
    expect(tasks.map((t) => t.content)).toEqual(["A"])
  })

  it("--all spans every branch", async () => {
    const b = await core.branchesService.createBranch({name: "F"})
    await seedTask(core, {branchId: "main"})
    await seedTask(core, {branchId: b.id})
    const all = await cli.listTasks({all: true, date: "2026-07-10"})
    expect(all).toHaveLength(2)
  })
})
