import {NO_PROJECT_ID, normalizeProjectEmoji} from "@daily/protocol"
import {notUndefined} from "@daily/std"

import type {Branch, Milestone, Tag, Task} from "@daily/protocol"
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

  async createBranch(branch: Pick<Branch, "name"> & Partial<Pick<Branch, "description" | "emoji">>): Promise<Branch | null> {
    const emoji = normalizeProjectEmoji(branch.emoji)
    if (branch.emoji?.trim() && !emoji) return null

    const name = branch.name.trim()
    if (!name) return null

    const existing = await this.branchModel.getBranchList()
    const hasDuplicate = existing.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())
    if (hasDuplicate) return null

    return this.branchModel.createBranch({name, description: branch.description, emoji})
  }

  async updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "description" | "name" | "emoji">>): Promise<Branch | null> {
    if (id === NO_PROJECT_ID && notUndefined(updates.name)) return null

    const next: Partial<Pick<Branch, "description" | "name" | "emoji">> = {}

    if (notUndefined(updates.name)) {
      const name = updates.name.trim()
      if (!name) return null

      const existing = await this.branchModel.getBranchList()
      const hasDuplicate = existing.some((item) => item.id !== id && item.name.trim().toLowerCase() === name.toLowerCase())
      if (hasDuplicate) return null

      next.name = name
    }

    if (notUndefined(updates.description)) next.description = updates.description

    if (notUndefined(updates.emoji)) {
      const emoji = normalizeProjectEmoji(updates.emoji)
      if (updates.emoji?.trim() && !emoji) return null
      next.emoji = emoji
    }

    return this.branchModel.updateBranch(id, next)
  }

  /**
   * Deletes a project along with its tasks, milestones and tags. `main` is refused before anything
   * is touched, and the four deletes run in one transaction so a project is never left half-deleted.
   * @returns the ids of the tasks, milestones and tags it removed, so the caller can drop exactly
   * those from the search index and name them in a changeset, or `null` when nothing was deleted.
   */
  async deleteBranch(
    id: Branch["id"],
  ): Promise<{deletedTaskIds: Task["id"][]; deletedMilestoneIds: Milestone["id"][]; deletedTagIds: Tag["id"][]} | null> {
    if (id === NO_PROJECT_ID) return null

    let deletedTaskIds: Task["id"][] = []
    let deletedMilestoneIds: Milestone["id"][] = []
    let deletedTagIds: Tag["id"][] = []
    let deleted = false

    const run = this.db.transaction(() => {
      deletedTaskIds = this.taskModel.deleteTasksByBranch(id)
      deletedMilestoneIds = this.milestoneModel.deleteMilestonesByBranch(id)
      deletedTagIds = this.tagModel.deleteTagsByBranch(id)
      deleted = this.branchModel.deleteBranch(id)
    })

    run()

    if (!deleted) return null

    const settings = await this.settingsService.loadSettings()
    const selectedIds = settings.branch?.selectedIds ?? []
    const remaining = selectedIds.filter((selectedId) => selectedId !== id)
    const nextIds = remaining.length ? remaining : [NO_PROJECT_ID]
    const branches = await this.branchModel.getBranchList()
    const isEveryProject = branches.every((branch) => nextIds.includes(branch.id))
    const isSetChanged = selectedIds.includes(id) || settings.branch?.activeId === id

    // A set that covers every remaining project is "All projects": only the flag shows projects created later.
    if (isSetChanged || (isEveryProject && !settings.branch?.isAllProjects)) {
      await this.settingsService.saveSettings({
        branch: {
          ...settings.branch,
          activeId: isSetChanged ? nextIds[nextIds.length - 1] : settings.branch.activeId,
          isAllProjects: Boolean(settings.branch?.isAllProjects) || isEveryProject,
          selectedIds: nextIds,
        },
      })
    }

    return {deletedTaskIds, deletedMilestoneIds, deletedTagIds}
  }

  async getActiveBranchId(): Promise<Branch["id"]> {
    const settings = await this.settingsService.loadSettings()
    const activeId = settings.branch?.activeId ?? NO_PROJECT_ID
    const active = await this.branchModel.getBranch(activeId)

    if (active) return active.id

    await this.settingsService.saveSettings({branch: {...settings.branch, activeId: NO_PROJECT_ID, selectedIds: [NO_PROJECT_ID]}})
    return NO_PROJECT_ID
  }

  async setActiveBranch(id: Branch["id"]): Promise<void> {
    const branch = await this.branchModel.getBranch(id)
    const nextId = branch?.id ?? NO_PROJECT_ID

    const settings = await this.settingsService.loadSettings()
    await this.settingsService.saveSettings({
      branch: {
        ...settings.branch,
        activeId: nextId,
        selectedIds: [nextId],
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
