export type ISODate = string
export type ISOTime = string
export type ISODateTime = string
export type Timezone = string

export type Tag = {
  id: string
  name: string
  color: string
}

export type Task = {
  id: string
  content: string
  done: boolean
  tags: Tag[]

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
}

export type Day = {
  id: string
  date: ISODate
  tasks: Task[]
  tags: Tag[]
  countActive: number
  countDone: number
}

export type Settings = {
  themes: {
    current: string
    preferred_light: string
    preferred_dark: string
    use_system: boolean
  }
  sidebar: {
    collapsed: boolean
  }
}

export type StoreSchema = {
  settings: Settings
  tasks: Task[]
  days: DayItem[]
  tags: Tag[]
}

export type ExportTaskData = {
  date: ISODate
  tasks: Array<{
    filename: string
    content: string
  }>
}