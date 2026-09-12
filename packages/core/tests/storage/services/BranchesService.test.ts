// @ts-nocheck
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {createStorageCore} from "@core/storage/createStorageCore"
import {BranchModel} from "@core/storage/models/BranchModel"
import {MilestoneModel} from "@core/storage/models/MilestoneModel"
import {SettingsModel} from "@core/storage/models/SettingsModel"
import {TagModel} from "@core/storage/models/TagModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {BranchesService} from "@core/storage/services/BranchesService"
import {SettingsService} from "@core/storage/services/SettingsService"
import {createTestDatabase} from "../../helpers/db"

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {BRANCHES: "BRANCHES", SETTINGS: "SETTINGS"},
  },
}))

vi.mock("../../../src/config/env", () => ({ENV: {isDev: false}}))

vi.mock("@daily/protocol", async (importOriginal) => ({...(await importOriginal()), WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))

describe("BranchesService", () => {
  let db, branchesService, settingsService

  beforeEach(() => {
    db = createTestDatabase()
    const branchModel = new BranchModel(db)
    const settingsModel = new SettingsModel(db)
    const taskModel = new TaskModel(db)
    const tagModel = new TagModel(db)
    const milestoneModel = new MilestoneModel(db)
    branchModel.ensureMainBranch()
    settingsService = new SettingsService(settingsModel)
    branchesService = new BranchesService(branchModel, settingsService, taskModel, tagModel, milestoneModel, db)
  })

  afterEach(() => {
    db.close()
  })

  it("rejects branch with duplicate name (case-insensitive)", async () => {
    await branchesService.createBranch({name: "Feature"})
    const duplicate = await branchesService.createBranch({name: "feature"})

    expect(duplicate).toBeNull()
  })

  it("rejects branch with empty name after trim", async () => {
    const result = await branchesService.createBranch({name: "   "})

    expect(result).toBeNull()
  })

  it("trims branch name on create", async () => {
    const branch = await branchesService.createBranch({name: "  Feature X  "})

    expect(branch.name).toBe("Feature X")
  })

  it("resets active branch to main when active branch is deleted", async () => {
    const branch = await branchesService.createBranch({name: "Temp"})
    await branchesService.setActiveBranch(branch.id)

    await branchesService.deleteBranch(branch.id)

    const activeId = await branchesService.getActiveBranchId()
    expect(activeId).toBe("main")
  })

  it("resolveBranchId returns active branch when no id provided", async () => {
    const branch = await branchesService.createBranch({name: "Work"})
    await branchesService.setActiveBranch(branch.id)

    const resolved = await branchesService.resolveBranchId()
    expect(resolved).toBe(branch.id)
  })

  it("resolveBranchId falls back to active when provided id doesn't exist", async () => {
    const resolved = await branchesService.resolveBranchId("nonexistent")
    expect(resolved).toBe("main")
  })

  it("accepts a description for Main but still refuses to rename it", async () => {
    const described = await branchesService.updateBranch("main", {description: "What Main is for"})
    expect(described?.description).toBe("What Main is for")

    const renamed = await branchesService.updateBranch("main", {name: "Renamed"})
    expect(renamed).toBeNull()
  })
})

describe("BranchesService — deleting a project takes its tasks, milestones and tags with it", () => {
  let root, coreDb, core

  function makeTask(overrides = {}) {
    return {
      status: "active",
      content: "Task",
      minimized: false,
      orderIndex: 1024,
      scheduled: {date: "2026-03-24", time: "", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      branchId: "main",
      tags: [],
      attachments: [],
      deletedAt: null,
      ...overrides,
    }
  }

  async function seedProject(name, {tasks, milestones, tags}) {
    const branch = await core.branchesService.createBranch({name})

    const seededTasks = []
    for (let i = 0; i < tasks; i++) {
      seededTasks.push(await core.tasksService.createTask(makeTask({content: `${name} task ${i}`, branchId: branch.id})))
    }

    const seededMilestones = []
    for (let i = 0; i < milestones; i++) {
      seededMilestones.push(
        await core.milestonesService.createMilestone({branchId: branch.id, name: `${name} milestone ${i}`, description: "", targetDate: null}),
      )
    }

    const seededTags = []
    for (let i = 0; i < tags; i++) {
      seededTags.push(await core.tagsService.createTag({name: `${name}-tag-${i}`, color: "#ff0000", branchId: branch.id}))
    }

    return {branch, tasks: seededTasks, milestones: seededMilestones, tags: seededTags}
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "daily-branchesservice-delete-"))
    coreDb = createTestDatabase()
    core = createStorageCore(coreDb, {
      appDataRoot: () => root,
      dbPath: () => join(root, "db.sqlite"),
      assetsDir: () => join(root, "assets"),
      remoteSyncPath: () => root,
    })
  })

  afterEach(() => {
    coreDb.close()
    rmSync(root, {recursive: true, force: true})
  })

  it("takes_TC-34_a_projects_tasks_milestones_and_tags_with_it_when_it_is_deleted", async () => {
    const first = await seedProject("First", {tasks: 3, milestones: 2, tags: 2})
    await seedProject("Second", {tasks: 1, milestones: 1, tags: 1})

    await core.branchesService.deleteBranch(first.branch.id)

    for (const task of first.tasks) {
      const after = await core.tasksService.getTask(task.id)
      expect(after).not.toBeNull()
      expect(after?.deletedAt).not.toBeNull()
    }
    for (const milestone of first.milestones) {
      const after = await core.milestonesService.getMilestone(milestone.id)
      expect(after).not.toBeNull()
      expect(after?.deletedAt).not.toBeNull()
    }
    for (const tag of first.tags) {
      const after = await core.tagsService.getTag(tag.id)
      expect(after).not.toBeNull()
      expect(after?.deletedAt).not.toBeNull()
    }

    const branches = await core.branchesService.getBranchList()
    expect(branches.some((b) => b.id === first.branch.id)).toBe(false)

    const remainingTaskIds = (await core.tasksService.getTaskList({})).map((t) => t.id)
    for (const task of first.tasks) expect(remainingTaskIds).not.toContain(task.id)

    const remainingMilestoneIds = (await core.milestonesService.getMilestoneList()).map((m) => m.id)
    for (const milestone of first.milestones) expect(remainingMilestoneIds).not.toContain(milestone.id)

    const remainingTagIds = (await core.tagsService.getTagList()).map((t) => t.id)
    for (const tag of first.tags) expect(remainingTagIds).not.toContain(tag.id)
  })

  it("leaves_TC-35_the_surviving_projects_rows_untouched_and_reassigns_no_branchId_to_main", async () => {
    const first = await seedProject("First", {tasks: 3, milestones: 2, tags: 2})
    const second = await seedProject("Second", {tasks: 1, milestones: 1, tags: 1})

    await core.branchesService.deleteBranch(first.branch.id)

    const survivingTask = await core.tasksService.getTask(second.tasks[0].id)
    expect(survivingTask?.deletedAt).toBeNull()
    expect(survivingTask?.branchId).toBe(second.branch.id)

    const survivingMilestone = await core.milestonesService.getMilestone(second.milestones[0].id)
    expect(survivingMilestone?.deletedAt).toBeNull()
    expect(survivingMilestone?.branchId).toBe(second.branch.id)

    const survivingTag = (await core.tagsService.getTagList()).find((t) => t.id === second.tags[0].id)
    expect(survivingTag).toBeDefined()

    for (const task of first.tasks) {
      const after = await core.tasksService.getTask(task.id)
      expect(after?.branchId).toBe(first.branch.id)
    }
    for (const milestone of first.milestones) {
      const after = await core.milestonesService.getMilestone(milestone.id)
      expect(after?.branchId).toBe(first.branch.id)
    }
  })
})
