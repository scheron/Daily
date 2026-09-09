import type {Branch, Day, ISODate, Task, TaskMovePosition, TaskStatus} from "@daily/protocol"
import type {ComputedRef, Ref} from "vue"

export type TaskDropPosition = TaskMovePosition

export type TaskMoveMeta = {
  taskId: Task["id"]
  fromStatus: TaskStatus
  toStatus: TaskStatus
  targetTaskId: Task["id"] | null
  position: TaskDropPosition
}

export type TaskRangeContext = {
  days: Ref<Day[]>
  activeDay: Ref<ISODate>
  isDaysLoaded: Ref<boolean>
  activeBranchId: ComputedRef<Branch["id"] | undefined>
}

export type TaskMutationsContext = {
  days: Ref<Day[]>
  activeDay: Ref<ISODate>
  activeBranchId: ComputedRef<Branch["id"] | undefined>
  activeDayData: ComputedRef<Day | null>
  dailyTasks: ComputedRef<Task[]>
  backlogTasks: Ref<Task[]>
  findTaskById: (taskId: Task["id"]) => Task | null
  refreshDay: (date: ISODate) => Promise<void>
  refreshDays: (dates: ISODate[]) => Promise<void>
  getBacklogList: () => Promise<void>
  refreshTrash: () => Promise<void>
  dropFromTrash: (taskId: Task["id"]) => void
  clearTrash: () => void
  isMilestoneMode: ComputedRef<boolean>
  getMilestoneTaskList: () => Promise<void>
}
