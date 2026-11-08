import type {IconName} from "@/types/icons"
import type {TaskPriority, TaskStatus} from "@daily/protocol"

export type TaskColumn = {
  status: TaskStatus
  label: string
  emptyLabel: string
  icon: IconName
  textClass: string
  cardBorderClass: string
  titleClass: string
  counterClass: string
  buttonVariant: "soft" | "error-soft" | "primary-ghost" | "success-soft" | "warning-soft"
}

export type PriorityLevel = {value: TaskPriority; label: string; color: string}
