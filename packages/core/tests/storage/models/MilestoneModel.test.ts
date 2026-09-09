// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@core/storage/models/BranchModel"
import {MilestoneModel} from "@core/storage/models/MilestoneModel"
import {TaskModel} from "@core/storage/models/TaskModel"
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

function makeMilestoneInput(overrides = {}) {
  return {
    branchId: "main",
    name: "Launch",
    date: null,
    description: null,
    deletedAt: null,
    ...overrides,
  }
}

function makeTaskInput(overrides = {}) {
  return {
    status: "active",
    content: "Test task",
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

describe("MilestoneModel", () => {
  let db
  let milestoneModel
  let taskModel
  let branchModel

  beforeEach(() => {
    db = createTestDatabase()
    milestoneModel = new MilestoneModel(db)
    taskModel = new TaskModel(db)
    branchModel = new BranchModel(db)
    branchModel.ensureMainBranch()
  })

  afterEach(() => {
    db.close()
  })

  it("creates_TC-1_a_milestone_with_only_a_name_leaving_date_description_and_deletedAt_empty", () => {
    const milestone = milestoneModel.createMilestone(makeMilestoneInput({name: "Launch"}))

    expect(milestone).not.toBeNull()
    expect(milestone.name).toBe("Launch")
    expect(milestone.date).toBeNull()
    expect(milestone.description).toBeNull()
    expect(milestone.deletedAt).toBeNull()

    const list = milestoneModel.getMilestoneList({branchId: "main"})
    expect(list.some((m) => m.id === milestone.id)).toBe(true)
  })

  it("scopes_TC-2_the_milestone_list_to_its_own_branch_and_hides_the_other_branchs_milestone", () => {
    const chelsea = branchModel.createBranch({name: "Chelsea"})

    const mainMilestone = milestoneModel.createMilestone(makeMilestoneInput({branchId: "main", name: "Main goal"}))
    const chelseaMilestone = milestoneModel.createMilestone(makeMilestoneInput({branchId: chelsea.id, name: "Chelsea goal"}))

    const mainList = milestoneModel.getMilestoneList({branchId: "main"})

    expect(mainList.some((m) => m.id === mainMilestone.id)).toBe(true)
    expect(mainList.some((m) => m.id === chelseaMilestone.id)).toBe(false)
  })

  it("deletes_TC-3_a_milestone_and_nulls_the_milestoneId_of_its_two_tasks_without_removing_them", () => {
    const milestone = milestoneModel.createMilestone(makeMilestoneInput({name: "Sunset"}))
    const taskA = taskModel.createTask(makeTaskInput({content: "A", milestoneId: milestone.id}))
    const taskB = taskModel.createTask(makeTaskInput({content: "B", milestoneId: milestone.id}))

    const deleted = milestoneModel.deleteMilestone(milestone.id)
    expect(deleted).toBe(true)

    const list = milestoneModel.getMilestoneList({branchId: "main"})
    expect(list.some((m) => m.id === milestone.id)).toBe(false)

    const reloadedA = taskModel.getTask(taskA.id)
    const reloadedB = taskModel.getTask(taskB.id)
    expect(reloadedA).not.toBeNull()
    expect(reloadedB).not.toBeNull()
    expect(reloadedA.milestoneId ?? null).toBeNull()
    expect(reloadedB.milestoneId ?? null).toBeNull()
  })

  it("creates_TC-4_a_second_milestone_sharing_an_existing_name_in_the_same_branch_without_erroring", () => {
    const first = milestoneModel.createMilestone(makeMilestoneInput({name: "v1.0"}))
    const second = milestoneModel.createMilestone(makeMilestoneInput({name: "v1.0"}))

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second.id).not.toBe(first.id)

    const list = milestoneModel.getMilestoneList({branchId: "main"})
    expect(list.filter((m) => m.name === "v1.0")).toHaveLength(2)
  })
})
