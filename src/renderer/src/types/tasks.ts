import type {ISODate, ISODateTime, ISOTime, Timezone} from "./date"

export type TaskStatus = "active" | "discarded" | "done"
export type Tag = {
  id: string
  name: string
  color: string
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

  /** Backend datetime when the task was created */
  createdAt: ISODateTime
  /** Backend datetime when the task was updated */
  updatedAt: ISODateTime
}

export type Day = {
  id: string
  date: ISODate
  subtitle?: string
  tasks: Task[]
  tags: Tag[]
  countActive: number
  countDone: number
}

/**
 * DayItem is a day item in the database
 * It is used to store the day item in the database
 * It is not used to store the day item in the UI
 */
export type DayItem = {
  id: string
  date: string
  subtitle?: string
}
