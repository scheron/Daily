// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {CliErrorCode} from "@shared/errors/cli/CliErrorCode"

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

describe("logTime / moveTask / updateContent / setEstimate / task tags", () => {
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
  it("replaces content only, leaving the estimate untouched", async () => {
    const t = await core.tasksService.createTask({...base, estimatedTime: 600})
    const up = await cli.updateContent(t.id, "New", {})
    expect(up.content).toBe("New")
    expect(up.estimatedTime).toBe(600)
  })
  it("sets the estimate in seconds, replacing any prior value", async () => {
    const t = await core.tasksService.createTask({...base, estimatedTime: 600})
    const up = await cli.setEstimate(t.id, 45, {})
    expect(up.estimatedTime).toBe(2700)
  })
  it("adds and removes an existing tag without changing other task fields", async () => {
    const tag = await core.tagsService.createTag({name: "work", color: "#111"})
    const t = await core.tasksService.createTask({...base, estimatedTime: 600, spentTime: 120})

    const tagged = await cli.addTaskTag(t.id, tag.name, {})
    expect(tagged.tags.map((item) => item.id)).toEqual([tag.id])
    expect(tagged).toMatchObject({content: t.content, scheduled: t.scheduled, estimatedTime: 600, spentTime: 120, status: "active"})

    const untagged = await cli.removeTaskTag(t.id, tag.id, {})
    expect(untagged.tags).toEqual([])
    expect(untagged).toMatchObject({content: t.content, scheduled: t.scheduled, estimatedTime: 600, spentTime: 120, status: "active"})
  })
  it("rejects an unknown task tag without creating it", async () => {
    const t = await core.tasksService.createTask(base)
    await expect(cli.addTaskTag(t.id, "missing", {})).rejects.toMatchObject({code: CliErrorCode.TAG_NOT_FOUND})
    expect((await core.tagsService.getTagList()).map((tag) => tag.name)).not.toContain("missing")
  })
  it("makes repeated task-tag mutations no-ops", async () => {
    const tag = await core.tagsService.createTag({name: "work", color: "#111"})
    const t = await core.tasksService.createTask({...base, tags: [tag]})

    const addAgain = new CliController(core, paths)
    expect((await addAgain.addTaskTag(t.id, tag.id, {})).tags.map((item) => item.id)).toEqual([tag.id])
    expect(addAgain.didMutate).toBe(false)

    const remove = await cli.removeTaskTag(t.id, tag.name, {})
    expect(remove.tags).toEqual([])
    const removeAgain = new CliController(core, paths)
    expect((await removeAgain.removeTaskTag(t.id, tag.id, {})).tags).toEqual([])
    expect(removeAgain.didMutate).toBe(false)
  })
})
