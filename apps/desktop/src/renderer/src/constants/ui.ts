import type {TaskColumn} from "@/types/ui"

export const TASK_CONTENT_MINIMIZED_HEIGHT = 200

/** Marks a day cell as a drop target; its value is the target `ISODate` (`data-drop-day="2026-06-28"`). */
export const DROP_DAY_SELECTOR = "[data-drop-day]"

/**
 * Surfaces that hide the dragged card while it is over them, so the day
 * highlight underneath stays visible. Whole containers, not day cells: hiding
 * per cell makes the card flicker in the gaps between them.
 */
export const DROP_HIDE_SELECTOR = ".app-footer, [data-popup], [data-calendar]"

/** Applied to the dragged clone while it hovers a surface from `DROP_HIDE_SELECTOR`. */
export const OVER_DROP_ZONE_CLASS = "is-over-drop-zone"

export const LEFT_PANEL_SIZE = {
  defaultSize: 320,
  minSize: 320,
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
    status: "backlog",
    label: "Backlog",
    emptyLabel: "backlog",
    icon: "inbox",
    titleClass: "text-base-content/60",
    counterClass: "bg-base-content/10 text-base-content/65",
  },
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
