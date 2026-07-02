import type {ISODate} from "@shared/types/common"
import type {Branch, Day, Task, TaskMovePosition, TaskStatus} from "@shared/types/storage"
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
  findTaskById: (taskId: Task["id"]) => Task | null
  refreshDay: (date: ISODate) => Promise<void>
  refreshDays: (dates: ISODate[]) => Promise<void>
}
