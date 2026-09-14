import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskStatus} from "@daily/protocol"

export const STATUS_ACTIONS: Array<{label: string; value: TaskStatus; icon: IconName; tooltip: string}> = [
  {label: "Backlog", value: "backlog", icon: "bookmark", tooltip: "Move to backlog"},
  {label: "Active", value: "active", icon: "fire", tooltip: "Set as active"},
  {label: "Done", value: "done", icon: "check-check", tooltip: "Mark as done"},
  {label: "Discarded", value: "discarded", icon: "archive", tooltip: "Discard task"},
]
