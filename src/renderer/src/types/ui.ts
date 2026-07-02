import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskStatus} from "@shared/types/storage"

export type TaskColumn = {
  status: TaskStatus
  label: string
  emptyLabel: string
  icon: IconName
  titleClass: string
  counterClass: string
}
