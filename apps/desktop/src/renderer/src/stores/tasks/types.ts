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

export type TaskMutationsContext = {
  tasks: Ref<Task[]>
  days: ComputedRef<Day[]>
  activeDay: Ref<ISODate>
  activeBranchId: ComputedRef<Branch["id"] | undefined>
  activeDayData: ComputedRef<Day | null>
  dailyTasks: ComputedRef<Task[]>
  backlogTasks: ComputedRef<Task[]>
  findTaskById: (taskId: Task["id"]) => Task | null
}
