export type ISODate = string
export type ISOTime = string
export type ISODateTime = string
export type Timezone = string

export type Task = {
  id: string
  content: string
  done: boolean

  scheduled: {
    date: ISODate
    time: ISOTime
    timezone: Timezone
  }

  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type DayItem = {
  id: string
  date: ISODate
  subtitle: string
}

export type Day = {
  id: string
  date: ISODate
  subtitle?: string
  tasks: Task[]
  countActive: number
  countDone: number
}

export type Settings = {
  theme: string
  sidebarCollapsed: boolean
}

export type StoreSchema = {
  settings: Settings
  tasks: Task[]
  days: DayItem[]
}

export type ExportTaskData = {
  date: ISODate
  tasks: Array<{
    filename: string
    content: string
  }>
}