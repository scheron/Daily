// @ts-nocheck
import {nanoid} from "nanoid"
import {afterEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@core/storage/models/BranchModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {SearchService} from "@core/storage/services/SearchService"
import {StorageController} from "@core/storage/StorageController"
import {createTestDatabase} from "../../helpers/db"

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {TASKS: "TASKS", TAGS: "TAGS", BRANCHES: "BRANCHES"},
  },
}))

vi.mock("../../../src/config/env", () => ({ENV: {isDev: false}}))

vi.mock("@daily/protocol", async (importOriginal) => ({...(await importOriginal()), WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))

function makeTaskInput(overrides = {}) {
  return {
    id: nanoid(),
    status: "active",
    content: "Task",
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: "2026-03-24", time: "", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    milestoneId: null,
    tags: [],
    attachments: [],
    deletedAt: null,
    ...overrides,
  }
}

const paths = {
  appDataRoot: () => "/tmp/daily-search",
  dbPath: () => "/tmp/daily-search/db",
  assetsDir: () => "/tmp/daily-search/assets",
  remoteSyncPath: () => "/tmp/daily-search/remote",
}

function makeHarness() {
  const db = createTestDatabase()
  const taskModel = new TaskModel(db)
  const branchModel = new BranchModel(db)
  branchModel.ensureMainBranch()

  const controller = new StorageController(db, paths)
  controller.searchService = new SearchService(taskModel, branchModel)

  return {db, taskModel, controller}
}

describe("StorageController — search", () => {
  let db

  afterEach(() => {
    db?.close()
  })

  it("finds_a_backlog_task_by_a_unique_word_in_its_text", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    taskModel.createTask(makeTaskInput({content: "Reticulate the splines", status: "backlog", scheduled: null}))
    await controller.searchService.initializeIndex()

    const results = await controller.searchTasks("splines")

    expect(results.map((r) => r.task.content)).toContain("Reticulate the splines")
  })
})
