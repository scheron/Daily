import type {TaskStatus} from "@daily/protocol"
import type {IconName} from "../ui/base/BaseIcon"

export type TaskColumn = {
  status: TaskStatus
  label: string
  emptyLabel: string
  icon: IconName
  titleClass: string
  counterClass: string
}
