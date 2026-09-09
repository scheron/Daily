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
    CONTEXT: {MILESTONES: "MILESTONES", TASKS: "TASKS", BRANCHES: "BRANCHES"},
  },
}))

vi.mock("../../../src/config/env", () => ({ENV: {isDev: false}}))

vi.mock("@daily/protocol", async (importOriginal) => ({...(await importOriginal()), WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))

function makeTaskInput(overrides = {}) {
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
  let milestoneModel
  let taskModel
  let branchModel
  let milestonesService

  beforeEach(() => {
    db = createTestDatabase()
    milestoneModel = new MilestoneModel(db)
    taskModel = new TaskModel(db)
    branchModel = new BranchModel(db)
    branchModel.ensureMainBranch()
    milestonesService = new MilestonesService(milestoneModel, taskModel)
  })

  afterEach(() => {
    db.close()
  })

  it("counts_TC-5_two_done_of_six_total_across_all_four_statuses_including_a_dayless_backlog_task", async () => {
    const milestone = milestoneModel.createMilestone({branchId: "main", name: "Checkout v2", date: null, description: null, deletedAt: null})

    taskModel.createTask(makeTaskInput({content: "active with day 1", status: "active", milestoneId: milestone.id}))
    taskModel.createTask(makeTaskInput({content: "active with day 2", status: "active", milestoneId: milestone.id}))
    taskModel.createTask(makeTaskInput({content: "active no day", status: "backlog", scheduled: null, milestoneId: milestone.id}))
    taskModel.createTask(makeTaskInput({content: "done 1", status: "done", milestoneId: milestone.id}))
    taskModel.createTask(makeTaskInput({content: "done 2", status: "done", milestoneId: milestone.id}))
    taskModel.createTask(makeTaskInput({content: "discarded", status: "discarded", milestoneId: milestone.id}))

    const list = await milestonesService.getMilestoneList({branchId: "main"})
    const found = list.find((m) => m.id === milestone.id)

    expect(found.progress).toEqual({done: 2, total: 6, percent: 33})
  })

  it("reports_TC-6_zero_done_zero_total_zero_percent_for_a_milestone_with_no_tasks_and_never_divides_by_zero", async () => {
    const milestone = milestoneModel.createMilestone({branchId: "main", name: "Empty", date: null, description: null, deletedAt: null})

    const list = await milestonesService.getMilestoneList({branchId: "main"})
    const found = list.find((m) => m.id === milestone.id)

    expect(found.progress).toEqual({done: 0, total: 0, percent: 0})
  })

  it("excludes_TC-7_a_soft_deleted_task_from_both_done_and_total", async () => {
    const milestone = milestoneModel.createMilestone({branchId: "main", name: "Cleanup", date: null, description: null, deletedAt: null})

    taskModel.createTask(makeTaskInput({content: "kept", status: "active", milestoneId: milestone.id}))
    const trashed = taskModel.createTask(makeTaskInput({content: "trashed", status: "done", milestoneId: milestone.id}))
    taskModel.updateTask(trashed.id, {deletedAt: new Date().toISOString()})

    const list = await milestonesService.getMilestoneList({branchId: "main"})
    const found = list.find((m) => m.id === milestone.id)

    expect(found.progress).toEqual({done: 0, total: 1, percent: 0})
  })

  it("excludes_TC-9_a_softdeleted_milestones_task_from_progress_while_leaving_the_tasks_db_reference_untouched", async () => {
    const milestone = milestoneModel.createMilestone({branchId: "main", name: "Gone", date: null, description: null, deletedAt: null})
    const task = taskModel.createTask(makeTaskInput({content: "orphaned", status: "active", milestoneId: milestone.id}))

    db.prepare(`UPDATE milestones SET deleted_at = ? WHERE id = ?`).run(new Date().toISOString(), milestone.id)

    const list = await milestonesService.getMilestoneList({branchId: "main"})
    expect(list.some((m) => m.id === milestone.id)).toBe(false)

    const reloadedTask = taskModel.getTask(task.id)
    expect(reloadedTask.milestoneId).toBe(milestone.id)
  })
})
