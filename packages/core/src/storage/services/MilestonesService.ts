import type {Branch, ISODate, Milestone, MilestoneWithProgress} from "@daily/protocol"
import type {MilestoneModel} from "../models/MilestoneModel"
import type {TaskModel} from "../models/TaskModel"

export class MilestonesService {
  constructor(
    private milestoneModel: MilestoneModel,
    private taskModel: TaskModel,
  ) {}

  async getMilestoneList(params?: {branchId?: Branch["id"]}): Promise<MilestoneWithProgress[]> {
    const milestones = this.milestoneModel.getMilestoneList({branchId: params?.branchId})
    const tasks = this.taskModel.getMilestoneTaskList({branchId: params?.branchId})

    const countsByMilestone = new Map<Milestone["id"], {done: number; total: number}>()
    for (const task of tasks) {
      if (!task.milestoneId) continue
      const counts = countsByMilestone.get(task.milestoneId) ?? {done: 0, total: 0}
      counts.total += 1
      if (task.status === "done") counts.done += 1
      countsByMilestone.set(task.milestoneId, counts)
    }

    return milestones.map((milestone) => {
      const counts = countsByMilestone.get(milestone.id) ?? {done: 0, total: 0}
      const percent = counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100)
      return {...milestone, progress: {done: counts.done, total: counts.total, percent}}
    })
  }

  async getMilestone(id: Milestone["id"]): Promise<Milestone | null> {
    return this.milestoneModel.getMilestone(id)
  }

  async createMilestone(input: {
    branchId: Branch["id"]
    name: string
    date?: ISODate | null
    description?: string | null
  }): Promise<Milestone | null> {
    return this.milestoneModel.createMilestone({
      branchId: input.branchId,
      name: input.name,
      date: input.date ?? null,
      description: input.description ?? null,
      deletedAt: null,
    })
  }

  async updateMilestone(id: Milestone["id"], updates: Partial<Pick<Milestone, "name" | "date" | "description">>): Promise<Milestone | null> {
    return this.milestoneModel.updateMilestone(id, updates)
  }

  async deleteMilestone(id: Milestone["id"]): Promise<boolean> {
    return this.milestoneModel.deleteMilestone(id)
  }
}
