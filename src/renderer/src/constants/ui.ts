import type {TaskColumn} from "@/types/ui"

export const TASK_CONTENT_MINIMIZED_HEIGHT = 200

/** Marks a day cell as a drop target; its value is the target `ISODate` (`data-drop-day="2026-06-28"`). */
export const DROP_DAY_SELECTOR = "[data-drop-day]"

/** Surfaces that accept a dragged task (footer, popups, explicit drop zones); the dragged clone hides while over any of them. */
export const DROP_ZONE_SELECTOR = ".app-footer, [data-popup], [data-day-drop-zone]"

/** Applied to the dragged clone while it hovers a drop zone. */
export const OVER_DROP_ZONE_CLASS = "is-over-drop-zone"

export const LEFT_PANEL_SIZE = {
  defaultSize: 300,
  minSize: 280,
  maxSize: 460,
  viewportReserve: 520,
}

export const RIGHT_PANEL_SIZE = {
  defaultSize: 420,
  minSize: 320,
  maxSize: 640,
  viewportReserve: 520,
}

export const COLUMN_MIN_WIDTH = 370

export const TASK_COLUMNS: TaskColumn[] = [
  {
    status: "active",
    label: "Active",
    emptyLabel: "active",
    icon: "fire",
    titleClass: "text-error/90 hover:text-error",
    counterClass: "bg-error/10 text-error",
  },
  {
    status: "done",
    label: "Done",
    emptyLabel: "completed",
    icon: "check-check",
    titleClass: "text-success/90 hover:text-success",
    counterClass: "bg-success/10 text-success",
  },
  {
    status: "discarded",
    label: "Discarded",
    emptyLabel: "discarded",
    icon: "archive",
    titleClass: "text-warning/90 hover:text-warning",
    counterClass: "bg-warning/10 text-warning",
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
