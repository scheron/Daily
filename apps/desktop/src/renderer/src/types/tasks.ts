import type {Branch, Tag, Task, TaskStatus} from "@daily/protocol"

export type TaskDraft = {
  content: string
  tags: Tag[]
  estimatedTime: number
  spentTime: number
  status: TaskStatus
  branchId: Branch["id"] | null
  scheduled: Task["scheduled"]
}
