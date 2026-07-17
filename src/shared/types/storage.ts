import type {AIConfig} from "./ai"
import type {ISODate, ISODateTime, ISOTime, Timezone} from "./common"
import type {AppUpdateSource} from "./update"

export type SyncStatus = "inactive" | "active" | "syncing" | "error"
export type SyncRemoteState = {
  id: string
  label: string
  lastSyncAt: string | null
  lastError: string | null
}
export type TaskStatus = "active" | "discarded" | "done"
export type TaskMovePosition = "before" | "after"

export type MainWindowSettings = {
  width: number
  height: number
  isMaximized: boolean
  isFullScreen: boolean
}

export type AppUpdateCacheState = {
  /**
   * Stable release identity (version + hash when available).
   * Used to dedupe background downloads.
   */
  releaseId: string
  version: string
  hash: string | null
  source: AppUpdateSource
  cachePath: string | null
  downloadedAt: ISODateTime
}

export type InstalledAppReleaseState = {
  releaseId: string
  version: string
  hash: string | null
  source: AppUpdateSource
  installedAt: ISODateTime
}

export type AppearanceMode = "light" | "dark" | "system"

export type SshSyncSettings = {
  enabled: boolean
  host: string
  dir: string
}

export type Settings = {
  version: string
  appearance: {
    mode: AppearanceMode
    accent: string
    base: string
  }
  sync: {
    enabled: boolean
    ssh: SshSyncSettings | null
  }
  ai: AIConfig | null
  branch: {
    activeId: Branch["id"]
  }
  layout: {
    /** Hide sections with no tasks. */
    sectionsHideEmpty: boolean
    /** Auto-collapse sections with no tasks. */
    sectionsAutoCollapseEmpty: boolean
    /** Manual collapse state per status. */
    sectionsCollapsed: Record<TaskStatus, boolean>
    /** Left widget panel. */
    leftPanel: {
      visible: boolean
    }
  }
  window: {
    main: MainWindowSettings
  }
  updates: {
    /**
     * Persisted "do not show again" marker for a specific release.
     * New releaseId resets prompt visibility naturally.
     */
    skippedReleaseId: string | null
    /**
     * Last release downloaded and available for install.
     */
    cached: AppUpdateCacheState | null
    /**
     * Last release successfully applied by the custom updater.
     */
    installed: InstalledAppReleaseState | null
  }
}

export type Task = {
  /** Task ID (task:ID) */
  id: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  /** ISO timestamp when task was soft-deleted. Null if not deleted. */
  deletedAt: ISODateTime | null
  /** Branch ID (project scope). */
  branchId: Branch["id"]

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
  id: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null

  name: string
  color: string
}

export type Branch = {
  id: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null

  name: string
}

export type File = {
  id: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null

  name: string
  mimeType: string
  size: number
}

export type Day = {
  id: string
  date: ISODate
  tasks: Task[]
  tags: Tag[]
  countActive: number
  countDone: number
}

export type TaskEventType = "created" | "completed" | "discarded" | "reactivated" | "edited" | "deleted" | "restored" | "moved"

export type TaskEvent = {
  id: string

  taskId: Task["id"]
  branchId: Branch["id"]
  type: TaskEventType
  /** The task's day this event belongs to (its scheduled date at event time). */
  eventDate: ISODate
  /** Move source day; null for non-move events. */
  fromDate: ISODate | null
  /** Move target day; null for non-move events. */
  toDate: ISODate | null
  /** Instant of the action — used for ordering and time-of-day display. */
  createdAt: ISODateTime
}

export type MoveTaskByOrderParams = {
  taskId: Task["id"]
  targetTaskId?: Task["id"] | null
  targetStatus?: TaskStatus
  position?: TaskMovePosition
}
