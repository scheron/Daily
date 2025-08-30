import type {ISODate, ISODateTime, ISOTime, Timezone} from "./date"

export type TaskStatus = "active" | "discarded" | "done"

export type Tag = {
  name: string
  color: string
  emoji: string
}

export type Task = {
  id: string
  content: string
  status: TaskStatus
  tags: Tag[]

  scheduled: {
    date: ISODate
    time: ISOTime
    timezone: Timezone
  }

  /**
   * The estimated time of the task.
   * @default 0
   */
  estimatedTime: number
  /**
   * The actual time spent on the task. \
   * Changes when the task is marked as done or discarded.
   * @default 0
   */
  actualTime: number

  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type Day = {
  id: string
  date: ISODate

  tasks: Task[]
  tags: Tag[]

  countActive: number
  countDone: number
}
