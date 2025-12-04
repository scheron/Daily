import type {TasksFilter} from "@/types/common"
import type {IconName} from "@/ui/base/BaseIcon"
import type {HTMLAttributes} from "vue"

type TaskFilter = {
  label: string
  value: TasksFilter
  icon: IconName
  activeClass: HTMLAttributes["class"]
  inactiveClass: HTMLAttributes["class"]
}

export const TASK_FILTERS: TaskFilter[] = [
  {
    label: "All",
    value: "all",
    icon: "today",
    activeClass: "bg-base-100 text-base-content",
    inactiveClass: "text-base-content/70 hover:text-base-content",
  },
  {
    label: "Active",
    value: "active",
    icon: "fire",
    activeClass: "bg-base-100 text-error bg-error/10",
    inactiveClass: "text-error/70 hover:text-error",
  },
  {
    label: "Discarded",
    value: "discarded",
    icon: "archive",
    activeClass: "bg-base-100 text-warning bg-warning/10",
    inactiveClass: "text-warning/70 hover:text-warning",
  },
  {
    label: "Done",
    value: "done",
    icon: "check-check",
    activeClass: "bg-base-100 text-success bg-success/10",
    inactiveClass: "text-success/70 hover:text-success",
  },
]
