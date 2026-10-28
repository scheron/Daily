import type {Milestone, MilestoneProgress, Task} from "@daily/protocol"

export function milestoneProgress(milestone: Milestone, tasks: Task[]): MilestoneProgress {
  const inMilestone = tasks.filter((task) => task.milestoneId === milestone.id)
  const resolved = inMilestone.filter((task) => task.status === "done" || task.status === "cancelled")

  return {total: inMilestone.length, resolved: resolved.length}
}
