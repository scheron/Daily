import {toTs} from "@daily/std"

import type {ISODate} from "../../types/common"
import type {Milestone, MilestoneProgress, MilestoneView} from "../../types/storage"

/** Closed exactly when the milestone holds tasks and none of them is still open. An empty milestone is open. */
export function isMilestoneClosed(progress: MilestoneProgress): boolean {
  return progress.total > 0 && progress.resolved === progress.total
}

/** The resolved share, `0..1`. An empty milestone is `0`. */
export function milestoneCompletion(progress: MilestoneProgress): number {
  if (progress.total === 0) return 0
  return progress.resolved / progress.total
}

/** Late exactly when a target date has passed and work is still open. A closed milestone is never late. */
export function isMilestoneOverdue(milestone: Pick<Milestone, "targetDate">, progress: MilestoneProgress, today: ISODate): boolean {
  if (!milestone.targetDate) return false
  if (isMilestoneClosed(progress)) return false

  return milestone.targetDate < today
}

/** Open milestones in manual order, then closed ones in manual order. One list, so no caller can invert the groups. */
export function sortMilestones<T extends MilestoneView>(milestones: T[]): T[] {
  return milestones.toSorted((a, b) => {
    const closedDiff = Number(isMilestoneClosed(a.progress)) - Number(isMilestoneClosed(b.progress))
    if (closedDiff !== 0) return closedDiff

    const orderDiff = a.orderIndex - b.orderIndex
    if (orderDiff !== 0) return orderDiff

    const createdAtDiff = toTs(a.createdAt) - toTs(b.createdAt)
    if (createdAtDiff !== 0) return createdAtDiff

    return a.id.localeCompare(b.id)
  })
}
