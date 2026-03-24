// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@main/storage/models/BranchModel"
import {SettingsModel} from "@main/storage/models/SettingsModel"
import {BranchesService} from "@main/storage/services/BranchesService"
import {SettingsService} from "@main/storage/services/SettingsService"
import {createTestDatabase} from "../../../helpers/db"

vi.mock("@main/utils/logger", () => ({
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

vi.mock("@main/config", () => ({
  APP_CONFIG: {window: {main: {width: 800, height: 600}}},
  ENV: {isDev: false},
}))

describe("BranchesService", () => {
  let db, branchesService, settingsService

  beforeEach(() => {
    db = createTestDatabase()
    const branchModel = new BranchModel(db)
    const settingsModel = new SettingsModel(db)
    branchModel.ensureMainBranch()
    settingsService = new SettingsService(settingsModel)
    branchesService = new BranchesService(branchModel, settingsService)
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
})
