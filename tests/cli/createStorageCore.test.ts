// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {createStorageCore} from "@main/storage/createStorageCore"
import {createTestDatabase} from "../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {}},
}))

const fakePaths = {
  appDataRoot: () => "/tmp/daily-test",
  dbPath: () => "/tmp/daily-test/db/daily.sqlite",
  assetsDir: () => "/tmp/daily-test/assets",
  remoteSyncPath: () => "/tmp/daily-test/remote",
  mutationSignalPath: () => "/tmp/daily-test/.cli-signal",
}

describe("createStorageCore", () => {
  let db
  beforeEach(() => {
    db = createTestDatabase()
  })
  afterEach(() => {
    db.close()
  })

  it("wires services over a db and ensures the main branch", async () => {
    const core = createStorageCore(db, fakePaths)
    const branches = await core.branchesService.getBranchList()
    expect(branches.some((b) => b.id === "main")).toBe(true)
    const created = await core.tasksService.createTask({
      id: "x",
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      branchId: "main",
      scheduled: {date: "2026-07-10", time: "", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      content: "core wired",
      minimized: false,
      orderIndex: 1,
      status: "active",
      tags: [],
      attachments: [],
    })
    expect(created?.content).toBe("core wired")
  })
})
