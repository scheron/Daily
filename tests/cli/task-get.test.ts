// @ts-nocheck
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {CliError} from "@shared/errors/cli/CliError"

import {CliController} from "@cli/CliController"
import {formatTaskDetails} from "@cli/output"
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

describe("describeTasks", () => {
  let db, core, cli, assetsDir

  beforeEach(() => {
    assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-describe-tasks-"))
    db = createTestDatabase()
    core = createStorageCore(db, {...paths, assetsDir: () => assetsDir})
    cli = new CliController(core, {...paths, assetsDir: () => assetsDir})
  })
  afterEach(() => {
    db.close()
    fs.rmSync(assetsDir, {recursive: true, force: true})
  })

  it("TC-10: lists files in the order their links appear in content, resolving each to its disk path or (file not found), independent of task.attachments", async () => {
    const savedId = await core.filesService.saveFile("first.png", Buffer.from("pixel"))
    const unrelatedId = await core.filesService.saveFile("unrelated.png", Buffer.from("other"))
    const missingId = "missing-file-id"
    const content = `intro\n![a](daily://file/${savedId})\nmiddle\n![b](daily://file/${missingId})\noutro`

    const task = await core.tasksService.createTask({
      id: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      branchId: "main",
      scheduled: {date: "2026-08-15", time: "", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      content,
      minimized: false,
      orderIndex: 1,
      status: "active",
      tags: [],
      attachments: [unrelatedId],
    })

    const [detail] = await cli.describeTasks([task])

    expect(detail.files).toEqual([
      {id: savedId, path: path.join(assetsDir, `${savedId}.png`)},
      {id: missingId, path: null},
    ])
    expect(detail.files.some((f) => f.id === unrelatedId)).toBe(false)

    const rendered = formatTaskDetails([detail])
    expect(rendered).toContain(`${savedId}  ${path.join(assetsDir, `${savedId}.png`)}`)
    expect(rendered).toContain(`${missingId}  (file not found)`)
    expect(rendered).not.toContain("~")
  })

  it("TC-11: resolves the project name from the branch, falling back to the branchId when the branch no longer resolves", async () => {
    const work = await core.branchesService.createBranch({name: "Work"})
    const inWork = await core.tasksService.createTask({
      id: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      branchId: work.id,
      scheduled: {date: "2026-08-15", time: "", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      content: "",
      minimized: false,
      orderIndex: 1,
      status: "active",
      tags: [],
      attachments: [],
    })

    const orphanBranch = await core.branchesService.createBranch({name: "Temp"})
    const orphanTask = await core.tasksService.createTask({
      id: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      branchId: orphanBranch.id,
      scheduled: {date: "2026-08-15", time: "", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      content: "",
      minimized: false,
      orderIndex: 1,
      status: "active",
      tags: [],
      attachments: [],
    })
    await core.branchesService.deleteBranch(orphanBranch.id)

    const [detailInWork, detailOrphan] = await cli.describeTasks([inWork, orphanTask])

    expect(detailInWork.projectName).toBe("Work")
    expect(detailOrphan.projectName).toBe(orphanBranch.id)
  })
})
