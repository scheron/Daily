import type {Branch, Tag, Task, TaskPriority, TaskStatus} from "@daily/protocol"

export type TaskDraft = {
  content: string
  tags: Tag[]
  estimatedTime: number
  spentTime: number
  status: TaskStatus
  priority: TaskPriority
  branchId: Branch["id"] | null
  scheduled: Task["scheduled"]
  milestoneId: Task["milestoneId"]
  blockedBy: Task["id"][]
  blocks: Task["id"][]
}
