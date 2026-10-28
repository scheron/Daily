import type {TaskColumn} from "@/types/ui"

export const TASK_COLUMNS: TaskColumn[] = [
  {
    status: "backlog",
    label: "Backlog",
    emptyLabel: "backlog",
    icon: "bookmark",
    titleClass: "text-base-content/70 hover:text-base-content",
    counterClass: "bg-base-content/10 text-base-content/70",
    buttonVariant: "soft",
  },
  {
    status: "ready_for_agent",
    label: "Ready for Agent",
    emptyLabel: "ready for agent",
    icon: "bot",
    titleClass: "text-error",
    counterClass: "bg-error/10 text-error",
    buttonVariant: "error-soft",
  },
  {
    status: "in_progress",
    label: "In Progress",
    emptyLabel: "in progress",
    icon: "fire",
    titleClass: "text-accent/90 hover:text-accent",
    counterClass: "bg-accent/10 text-accent",
    buttonVariant: "primary-ghost",
  },
  {
    status: "ready_to_merge",
    label: "Ready to Merge",
    emptyLabel: "ready to merge",
    icon: "git-pull-request",
    titleClass: "text-info",
    counterClass: "bg-info/10 text-info",
    buttonVariant: "soft",
  },
  {
    status: "done",
    label: "Done",
    emptyLabel: "completed",
    icon: "check-check",
    titleClass: "text-success/90 hover:text-success",
    counterClass: "bg-success/10 text-success",
    buttonVariant: "success-soft",
  },
  {
    status: "cancelled",
    label: "Cancelled",
    emptyLabel: "cancelled",
    icon: "archive",
    titleClass: "text-warning/90 hover:text-warning",
    counterClass: "bg-warning/10 text-warning",
    buttonVariant: "warning-soft",
  },
]

/** Every board card is exactly this tall; the virtual columns and the drop index compute positions from it, so it must match the card. */
export const BOARD_CARD_HEIGHT = 200

/** A board card plus the gap below it; the virtual columns and the drop index step through a column by it, so it must match the card. */
export const BOARD_CARD_STEP = 206

export const BOARD_CARD_GAP = BOARD_CARD_STEP - BOARD_CARD_HEIGHT
export const COMPACT_BOARD_CARD_HEIGHT = 108
