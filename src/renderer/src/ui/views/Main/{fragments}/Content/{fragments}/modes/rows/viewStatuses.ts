import type {TaskStatus} from "@shared/types/storage"

/** Display order of the view switcher segments */
export const VIEW_ORDER: TaskStatus[] = ["active", "done", "discarded"]

/** Shape of vuedraggable's @change payload used by the board flow */
export type DraggableChangeEvent = {
  added?: {newIndex: number}
  moved?: {newIndex: number; oldIndex: number}
}

/** The two statuses a dragged task can move to from the given view */
export function otherStatuses(status: TaskStatus): [TaskStatus, TaskStatus] {
  return VIEW_ORDER.filter((other) => other !== status) as [TaskStatus, TaskStatus]
}
