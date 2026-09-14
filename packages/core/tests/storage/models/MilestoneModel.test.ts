// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@core/storage/models/BranchModel"
import {MilestoneModel} from "@core/storage/models/MilestoneModel"
import {createTestDatabase} from "../../helpers/db"

vi.mock("../../../src/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {MILESTONES: "MILESTONES"}},
}))

vi.mock("../../../src/config/env", () => ({ENV: {isDev: false}}))

vi.mock("@daily/protocol", async (importOriginal) => ({...(await importOriginal()), WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))

describe("MilestoneModel", () => {
  let db
  let milestoneModel
  let branchModel

  beforeEach(() => {
    db = createTestDatabase()
    branchModel = new BranchModel(db)
    branchModel.ensureMainBranch()
    milestoneModel = new MilestoneModel(db)
  })

  afterEach(() => {
    db.close()
  })

  it("writes_TC-11_and_reads_back_a_milestones_name_target_date_and_description_and_soft-deletes_it", () => {
    const milestone = milestoneModel.createMilestone({branchId: "main", name: "Launch", description: "", targetDate: null})
    expect(milestone.name).toBe("Launch")
    expect(milestone.targetDate).toBeNull()
    expect(milestone.description).toBe("")

    milestoneModel.updateMilestone(milestone.id, {name: "Launch v2"})
    expect(milestoneModel.getMilestone(milestone.id).name).toBe("Launch v2")

    milestoneModel.updateMilestone(milestone.id, {targetDate: "2026-12-01"})
    expect(milestoneModel.getMilestone(milestone.id).targetDate).toBe("2026-12-01")

    milestoneModel.updateMilestone(milestone.id, {description: "Ship the thing"})
    expect(milestoneModel.getMilestone(milestone.id).description).toBe("Ship the thing")

    const deleted = milestoneModel.deleteMilestone(milestone.id)
    expect(deleted).toBe(true)
    expect(milestoneModel.getMilestoneList().map((m) => m.id)).not.toContain(milestone.id)

    const stillThere = milestoneModel.getMilestoneList({includeDeleted: true}).find((m) => m.id === milestone.id)
    expect(stillThere).toBeDefined()
    expect(stillThere.deletedAt).not.toBeNull()
  })

  it("ignores_TC-33_a_branchId_on_updateMilestone_a_milestone_never_moves_project", () => {
    const other = branchModel.createBranch({name: "Other project"})
    const milestone = milestoneModel.createMilestone({branchId: "main", name: "Launch", description: "", targetDate: null})

    milestoneModel.updateMilestone(milestone.id, {name: "Launch v2", branchId: other.id})

    const after = milestoneModel.getMilestone(milestone.id)
    expect(after.name).toBe("Launch v2")
    expect(after.branchId).toBe("main")
  })
})
