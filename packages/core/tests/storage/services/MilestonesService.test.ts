// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@core/storage/models/BranchModel"
import {MilestoneModel} from "@core/storage/models/MilestoneModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {MilestonesService} from "@core/storage/services/MilestonesService"
import {createTestDatabase} from "../../helpers/db"

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {MILESTONES: "MILESTONES", TASKS: "TASKS"},
  },
}))

vi.mock("../../../src/config/env", () => ({ENV: {isDev: false}}))

vi.mock("@daily/protocol", async (importOriginal) => ({...(await importOriginal()), WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))

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

describe("MilestonesService", () => {
  let db
  let taskModel
  let milestonesService

  beforeEach(() => {
    db = createTestDatabase()
    const branchModel = new BranchModel(db)
    branchModel.ensureMainBranch()
    taskModel = new TaskModel(db)
    milestonesService = new MilestonesService(new MilestoneModel(db))
  })

  afterEach(() => {
    db.close()
  })

  it("clears_TC-12_the_milestoneId_of_every_task_it_held_and_leaves_the_tasks_themselves_untouched", async () => {
    const milestone = await milestonesService.createMilestone({branchId: "main", name: "Launch", description: "", targetDate: null})

    const tasks = [
      taskModel.createTask(makeTask({content: "one", status: "active", milestoneId: milestone.id})),
      taskModel.createTask(makeTask({content: "two", status: "done", milestoneId: milestone.id})),
      taskModel.createTask(makeTask({content: "three", status: "backlog", scheduled: null, milestoneId: milestone.id})),
    ]

    const deleted = await milestonesService.deleteMilestone(milestone.id)
    expect(deleted).toBe(true)

    for (const seeded of tasks) {
      const after = taskModel.getTask(seeded.id)
      expect(after).not.toBeNull()
      expect(after.milestoneId).toBeNull()
      expect(after.status).toBe(seeded.status)
      expect(after.scheduled).toEqual(seeded.scheduled)
    }
  })
})
