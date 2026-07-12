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
  mutationSignalPath: () => "/tmp/daily-add-signal",
}

describe("addTask", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("creates a task on an explicit date with tags and estimate", async () => {
    const t = await cli.addTask({content: "Review PR", date: "2026-07-10", tags: ["work"], estimateMinutes: 30})
    expect(t.content).toBe("Review PR")
    expect(t.scheduled.date).toBe("2026-07-10")
    expect(t.estimatedTime).toBe(1800)
    expect(t.tags.map((x) => x.name)).toContain("work")
    expect(t.branchId).toBe("main")
  })

  it("defaults the date to today", async () => {
    const t = await cli.addTask({content: "No date"})
    expect(t.scheduled.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
