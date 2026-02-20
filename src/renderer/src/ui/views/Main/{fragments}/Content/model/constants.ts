import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskStatus} from "@shared/types/storage"

export const NEW_TASK_ID = "new-task"
export const SORTABLE_ANIMATION_MS = 160

type BoardColumn = {
  status: TaskStatus
  label: string
  emptyLabel: string
  icon: IconName
  titleClass: string
  counterClass: string
}

export const BOARD_COLUMNS: BoardColumn[] = [
  {status: "active", label: "Active", emptyLabel: "active", icon: "fire", titleClass: "text-error", counterClass: "bg-error/10 text-error"},
  {
    status: "discarded",
    label: "Discarded",
    emptyLabel: "discarded",
    icon: "archive",
    titleClass: "text-warning",
    counterClass: "bg-warning/10 text-warning",
  },
  {
    status: "done",
    label: "Done",
    emptyLabel: "completed",
    icon: "check-check",
    titleClass: "text-success",
    counterClass: "bg-success/10 text-success",
  },
]

export const DRAGGABLE_ATTRS = {
  group: "daily-board",
  filter: "[data-draggable-task-ignore], [data-draggable-task-ignore] *, button, a, input, textarea, select, [role='button']",
  preventOnFilter: false,
  forceFallback: true,
  fallbackOnBody: true,
  fallbackTolerance: 2,
  ghostClass: "draggable-task-ghost",
  chosenClass: "draggable-task-chosen",
  dragClass: "draggable-task-dragging",
  animation: 140,
}
