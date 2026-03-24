import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@main/storage/models/BranchModel"
import {createTestDatabase} from "../../../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {BRANCHES: "BRANCHES"}},
}))

vi.mock("@main/config", () => ({
  APP_CONFIG: {window: {main: {width: 800, height: 600}}},
  ENV: {isDev: false},
}))

describe("BranchModel", () => {
  let db
  let branchModel

  beforeEach(() => {
    db = createTestDatabase()
    branchModel = new BranchModel(db)
    branchModel.ensureMainBranch()
  })

  afterEach(() => {
    db.close()
  })

  it("ensureMainBranch creates main branch idempotently", () => {
    branchModel.ensureMainBranch()
    branchModel.ensureMainBranch()

    const branches = branchModel.getBranchList()
    expect(branches).toHaveLength(1)
    expect(branches[0].id).toBe("main")
    expect(branches[0].name).toBe("Main")
  })

  it("creates and reads a custom branch", () => {
    const branch = branchModel.createBranch({name: "Feature X"})

    expect(branch.name).toBe("Feature X")
    expect(branchModel.getBranchList()).toHaveLength(2) // main + Feature X
  })

  it("prevents deleting and renaming the main branch", () => {
    branchModel.ensureMainBranch()

    expect(branchModel.deleteBranch("main")).toBe(false)
    expect(branchModel.updateBranch("main", {name: "Renamed"})).toBeNull()

    const main = branchModel.getBranch("main")
    expect(main.name).toBe("Main")
  })

  it("soft deletes a custom branch", () => {
    branchModel.ensureMainBranch()
    const branch = branchModel.createBranch({name: "Temp"})

    branchModel.deleteBranch(branch.id)

    expect(branchModel.getBranchList()).toHaveLength(1) // only main
    expect(branchModel.getBranchList({includeDeleted: true})).toHaveLength(2)
  })
})
