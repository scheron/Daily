// @ts-nocheck
import {nanoid} from "nanoid"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@core/storage/models/BranchModel"
import {MilestoneModel} from "@core/storage/models/MilestoneModel"
import {SettingsModel} from "@core/storage/models/SettingsModel"
import {TagModel} from "@core/storage/models/TagModel"
import {TaskEventModel} from "@core/storage/models/TaskEventModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {BranchesService} from "@core/storage/services/BranchesService"
import {SettingsService} from "@core/storage/services/SettingsService"
import {TaskEventsService} from "@core/storage/services/TaskEventsService"
import {TasksService} from "@core/storage/services/TasksService"
import {StorageController} from "@core/storage/StorageController"
import {createTestDatabase} from "../../helpers/db"

/**
 * TC-24 · US-5 · gate-b: N/A
 * given: a database holding dated and dateless tasks across two projects, and one soft-deleted task
 * when: the flat read is called with no arguments
 * then: it returns every live task of both projects, backlog included, and not the deleted one
 *
 * Retargeted per the human's 2026-09-14 decision: the all-projects read is a new
 * `StorageController.getAllTasks()`, not `getTaskList` with a flag — `getTaskList` keeps its
 * active-project scoping for `tasks:get-many` and the AI tools. `getAllTasks` does not exist yet
 * (phase 3), so this stays red until it lands. `StorageController` is built by hand rather than
 * through `init()`, the same technique `serverProvider.test.ts` already uses, to avoid the sync
 * engine and the filesystem it touches.
 */

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
  appDataRoot: () => "/tmp/daily-tc24",
  dbPath: () => "/tmp/daily-tc24/db",
  assetsDir: () => "/tmp/daily-tc24/assets",
  remoteSyncPath: () => "/tmp/daily-tc24/remote",
}

describe("StorageController.getAllTasks — the flat read", () => {
  let db, taskModel, branchModel, tasksService, branchesService, controller

  beforeEach(() => {
    db = createTestDatabase()
    taskModel = new TaskModel(db)
    branchModel = new BranchModel(db)
    branchModel.ensureMainBranch()
    const tagModel = new TagModel(db)
    const milestoneModel = new MilestoneModel(db)
    const settingsService = new SettingsService(new SettingsModel(db))
    tasksService = new TasksService(taskModel, new TaskEventsService(new TaskEventModel(db)))
    branchesService = new BranchesService(branchModel, settingsService, taskModel, tagModel, milestoneModel, db)

    controller = new StorageController(db, paths)
    controller.tasksService = tasksService
    controller.branchesService = branchesService
  })

  afterEach(() => db.close())

  it("returns_TC-24_every_live_task_of_both_projects_backlog_included_when_called_with_no_scope", async () => {
    const other = branchModel.createBranch({name: "Other"})

    const datedMain = taskModel.createTask(makeTaskInput({content: "Dated main", branchId: "main"}))
    const backlogOther = taskModel.createTask(makeTaskInput({content: "Backlog other", branchId: other.id, status: "backlog", scheduled: null}))
    const toDelete = taskModel.createTask(makeTaskInput({content: "Goes away", branchId: "main"}))
    taskModel.deleteTask(toDelete.id)

    const all = await controller.getAllTasks()
    const ids = all.map((t) => t.id)

    expect(ids).toContain(datedMain.id)
    expect(ids).toContain(backlogOther.id)
    expect(ids).not.toContain(toDelete.id)
  })
})
