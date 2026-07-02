import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskStatus} from "@shared/types/storage"

export const STATUS_ACTIONS: Array<{label: string; value: TaskStatus; icon: IconName; tooltip: string}> = [
  {label: "Active", value: "active", icon: "fire", tooltip: "Set as active"},
  {label: "Discarded", value: "discarded", icon: "archive", tooltip: "Discard task"},
  {label: "Done", value: "done", icon: "check-check", tooltip: "Mark as done"},
]
