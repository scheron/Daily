import {MAIN_BRANCH_ID} from "@shared/constants/storage"

import type {BranchModel} from "@/storage/models/BranchModel"
import type {SettingsService} from "@/storage/services/SettingsService"
import type {Branch} from "@shared/types/storage"

export class BranchesService {
  constructor(
    private branchModel: BranchModel,
    private settingsService: SettingsService,
  ) {}

  async getBranchList(): Promise<Branch[]> {
    return this.branchModel.getBranchList()
  }

  async getBranch(id: Branch["id"]): Promise<Branch | null> {
    return this.branchModel.getBranch(id)
  }

  async createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Branch | null> {
    const name = branch.name.trim()
    if (!name) return null

    const existing = await this.branchModel.getBranchList()
    const hasDuplicate = existing.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())
    if (hasDuplicate) return null

    return this.branchModel.createBranch({name})
  }

  async updateBranch(id: Branch["id"], updates: Pick<Branch, "name">): Promise<Branch | null> {
    if (id === MAIN_BRANCH_ID) return null

    const name = updates.name.trim()
    if (!name) return null

    const existing = await this.branchModel.getBranchList()
    const hasDuplicate = existing.some((item) => item.id !== id && item.name.trim().toLowerCase() === name.toLowerCase())
    if (hasDuplicate) return null

    return this.branchModel.updateBranch(id, {name})
  }

  async deleteBranch(id: Branch["id"]): Promise<boolean> {
    const deleted = await this.branchModel.deleteBranch(id)
    if (!deleted) return false

    const settings = await this.settingsService.loadSettings()
    const activeId = settings.branch?.activeId ?? MAIN_BRANCH_ID
    if (activeId === id) {
      await this.settingsService.saveSettings({
        branch: {
          ...settings.branch,
          activeId: MAIN_BRANCH_ID,
        },
      })
    }

    return true
  }

  async getActiveBranchId(): Promise<Branch["id"]> {
    const settings = await this.settingsService.loadSettings()
    const activeId = settings.branch?.activeId ?? MAIN_BRANCH_ID
    const active = await this.branchModel.getBranch(activeId)

    if (active) return active.id

    await this.settingsService.saveSettings({branch: {...settings.branch, activeId: MAIN_BRANCH_ID}})
    return MAIN_BRANCH_ID
  }

  async setActiveBranch(id: Branch["id"]): Promise<void> {
    const branch = await this.branchModel.getBranch(id)
    const nextId = branch?.id ?? MAIN_BRANCH_ID

    const settings = await this.settingsService.loadSettings()
    await this.settingsService.saveSettings({
      branch: {
        ...settings.branch,
        activeId: nextId,
      },
    })
  }

  async resolveBranchId(branchId?: Branch["id"]): Promise<Branch["id"]> {
    if (branchId) {
      const branch = await this.branchModel.getBranch(branchId)
      if (branch) return branch.id
    }

    return this.getActiveBranchId()
  }
}
