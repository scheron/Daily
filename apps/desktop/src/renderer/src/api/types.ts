import type {Branch, Tag, Task, TaskStatus} from "@daily/protocol"

/** `id`, when present, is the id the row is stored under. */
export type CreateTaskParams = {
  id?: Task["id"]
  date?: string
  time?: string
  timezone?: string
  tags?: Tag[]
  estimatedTime?: number
  orderIndex?: number
  branchId?: Branch["id"]
  status?: TaskStatus
  milestoneId?: Task["milestoneId"]
}
