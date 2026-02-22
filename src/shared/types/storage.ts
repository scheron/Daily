import type {AIConfig} from "./ai"
import type {ID, ISODate, ISODateTime, ISOTime, Timezone} from "./common"

export type SyncStatus = "inactive" | "active" | "syncing" | "error"
export type LayoutType = "list" | "columns"
export type TaskStatus = "active" | "discarded" | "done"
export type TaskMoveMode = "list" | "column"
export type TaskMovePosition = "before" | "after"

export type Settings = {
  version: string
  themes: {
    current: string
    preferredLight: string
    preferredDark: string
    useSystem: boolean
    glassUI: boolean
  }
  sidebar: {
    collapsed: boolean
  }
  sync: {
    enabled: boolean
  }
  ai: AIConfig | null
  branch: {
    activeId: ID
  }
  layout: {
    type: LayoutType
    /**
     * Indicates whether columns with no tasks should be hidden.
     * Applies only to the "columns" layout type.
     */
    columnsHideEmpty: boolean
    /**
     * Indicates whether empty columns should be automatically collapsed.
     * Applies only to the "columns" layout type.
     */
    columnsAutoCollapseEmpty: boolean
    /**
     * Indicates whether columns have been manually collapsed.
     * Applies only to the "columns" layout type.
     * @example {active: true, discarded: false, done: false} means that "active" and "done" columns are collapsed by user
     * @default {active: false, discarded: false, done: false}
     */
    columnsCollapsed: Record<TaskStatus, boolean>
  }
}

export type Task = {
  /** Task ID (task:ID) */
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  /** ISO timestamp when task was soft-deleted. Null if not deleted. */
  deletedAt: ISODateTime | null
  /** Branch ID (project scope). */
  branchId: ID

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
  /**
   * Indicates whether task content is visually collapsed in cards.
   * @default false
   */
  minimized: boolean
  /**
   * Persistent position index used to sort tasks manually.
   * Lower values are shown first.
   */
  orderIndex: number
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
}

export type Branch = {
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null

  name: string
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

export type MoveTaskByOrderParams = {
  taskId: Task["id"]
  mode: TaskMoveMode
  targetTaskId?: Task["id"] | null
  targetStatus?: TaskStatus
  position?: TaskMovePosition
}
