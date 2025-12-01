import type {AnimatedTab} from "@/ui/common/misc/AnimatedTabs"
import type {TaskStatus} from "@shared/types/storage"

export const STATUS_BUTTONS: AnimatedTab<TaskStatus>[] = [
  {
    id: "active",
    label: "Active",
    icon: "fire",
    tooltip: "Set as active",
    activeClass: "text-error bg-error/10 border-error hover:text-error",
    inactiveClass: "hover:text-error",
  },
  {
    label: "Discarded",
    icon: "archive",
    id: "discarded",
    tooltip: "Discard task",
    activeClass: "text-warning bg-warning/10 border-warning hover:text-warning",
    inactiveClass: "hover:text-warning",
  },
  {
    label: "Done",
    icon: "check-check",
    id: "done",
    tooltip: "Mark as done",
    activeClass: "text-success bg-success/10 border-success hover:text-success",
    inactiveClass: "hover:text-success",
  },
]
