import {MAIN_BRANCH_ID} from "@daily/protocol"
import {notUndefined} from "@daily/std"

import type {Branch, Task} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"
import type {BranchModel} from "../models/BranchModel"
import type {MilestoneModel} from "../models/MilestoneModel"
import type {TagModel} from "../models/TagModel"
import type {TaskModel} from "../models/TaskModel"
import type {SettingsService} from "./SettingsService"

export class BranchesService {
  constructor(
    private branchModel: BranchModel,
    private settingsService: SettingsService,
    private taskModel: TaskModel,
    private tagModel: TagModel,
    private milestoneModel: MilestoneModel,
    private db: SqliteDriver,
  ) {}

  async getBranchList(): Promise<Branch[]> {
    return this.branchModel.getBranchList()
  }

  async getBranch(id: Branch["id"]): Promise<Branch | null> {
    return this.branchModel.getBranch(id)
  }

  async createBranch(branch: Pick<Branch, "name"> & Partial<Pick<Branch, "description">>): Promise<Branch | null> {
    const name = branch.name.trim()
    if (!name) return null

    const existing = await this.branchModel.getBranchList()
    const hasDuplicate = existing.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())
    if (hasDuplicate) return null

    return this.branchModel.createBranch({name, description: branch.description})
  }

  async updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "description" | "name">>): Promise<Branch | null> {
    if (id === MAIN_BRANCH_ID && notUndefined(updates.name)) return null

    const next: Partial<Pick<Branch, "description" | "name">> = {}

    if (notUndefined(updates.name)) {
      const name = updates.name.trim()
      if (!name) return null

      const existing = await this.branchModel.getBranchList()
      const hasDuplicate = existing.some((item) => item.id !== id && item.name.trim().toLowerCase() === name.toLowerCase())
      if (hasDuplicate) return null

      next.name = name
    }

    if (notUndefined(updates.description)) next.description = updates.description

    return this.branchModel.updateBranch(id, next)
  }

  /**
   * Deletes a project along with its tasks, milestones and tags. `main` is refused before anything
   * is touched, and the four deletes run in one transaction so a project is never left half-deleted.
   * @returns the ids of the tasks it removed, so the caller can drop exactly those from the search
   * index, or `null` when nothing was deleted.
   */
  async deleteBranch(id: Branch["id"]): Promise<{deletedTaskIds: Task["id"][]} | null> {
    if (id === MAIN_BRANCH_ID) return null

    let deletedTaskIds: Task["id"][] = []
    let deleted = false

    const run = this.db.transaction(() => {
      deletedTaskIds = this.taskModel.deleteTasksByBranch(id)
      this.milestoneModel.deleteMilestonesByBranch(id)
      this.tagModel.deleteTagsByBranch(id)
      deleted = this.branchModel.deleteBranch(id)
    })

    run()

    if (!deleted) return null

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

    return {deletedTaskIds}
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
