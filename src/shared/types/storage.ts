import type {ID, ISODate, ISODateTime, ISOTime, Timezone} from "./common"

export type SyncStatus = "inactive" | "active" | "syncing" | "error"

export type Settings = {
  version: string
  themes: {
    current: string
    preferredLight: string
    preferredDark: string
    useSystem: boolean
  }
  sidebar: {
    collapsed: boolean
  }
  sync: {
    enabled: boolean
  }
}

export type TaskStatus = "active" | "discarded" | "done"

export type Task = {
  /** Task ID (task:ID) */
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  /** ISO timestamp when task was soft-deleted. Null if not deleted. */
  deletedAt: ISODateTime | null

  scheduled: {
    date: ISODate
    time: ISOTime
    timezone: Timezone
  }
  /**
   * The estimated time of the task in seconds
   * @default 0
   */
  estimatedTime: number
  /**
   * The actual time spent on the task in seconds. \
   * Changes when the task is marked as done or discarded.
   * @default 0
   */
  spentTime: number

  content: string
  status: "active" | "done" | "discarded"
  tags: Tag[]
  /** Files IDs  */
  attachments: string[]
}

export type Tag = {
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null

  name: string
  color: string
  /** @deprecated Remove in future */
  emoji: string
}

export type File = {
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null

  name: string
  mimeType: string
  size: number
}

export type Day = {
  id: ID
  date: ISODate
  tasks: Task[]
  tags: Tag[]
  countActive: number
  countDone: number
}
