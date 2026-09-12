import type {Branch, Milestone, MilestoneView} from "@daily/protocol"
import type {MilestoneModel} from "../models/MilestoneModel"

export class MilestonesService {
  constructor(private milestoneModel: MilestoneModel) {}

  async getMilestoneList(branchId?: Branch["id"]): Promise<MilestoneView[]> {
    return this.milestoneModel.getMilestoneList({branchId})
  }

  async getMilestone(id: Milestone["id"]): Promise<MilestoneView | null> {
    return this.milestoneModel.getMilestone(id)
  }

  async createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<MilestoneView | null> {
    return this.milestoneModel.createMilestone(milestone)
  }

  async updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<MilestoneView | null> {
    return this.milestoneModel.updateMilestone(id, updates)
  }

  async deleteMilestone(id: Milestone["id"]): Promise<boolean> {
    return this.milestoneModel.deleteMilestone(id)
  }
}
