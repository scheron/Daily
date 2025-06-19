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