import type {Milestone, MilestoneProgress, Task} from "@daily/protocol"

/** Counts a milestone's tasks and how many of them are resolved — done or discarded. */
export function milestoneProgress(milestone: Milestone, tasks: Task[]): MilestoneProgress {
  const inMilestone = tasks.filter((task) => task.milestoneId === milestone.id)
  const resolved = inMilestone.filter((task) => task.status === "done" || task.status === "discarded")

  return {total: inMilestone.length, resolved: resolved.length}
}
