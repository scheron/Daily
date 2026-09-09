import type {AIConfig} from "./ai"
import type {ISODate, ISODateTime, ISOTime, Timezone} from "./common"
import type {ServerBindingView} from "./syncServer"
import type {AppUpdateSource, GitHubReleaseMeta} from "./update"

export type SyncStatus = "inactive" | "active" | "syncing" | "error"
export type SyncRemoteState = {
  id: string
  label: string
  lastSyncAt: string | null
  lastError: string | null
}
export type TaskStatus = "backlog" | "active" | "discarded" | "done"
/** The three statuses shown as board columns; excludes `backlog`, which lives in the sidebar. */
export type BoardStatus = Exclude<TaskStatus, "backlog">
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

/**
 * Result of the last GitHub release lookup, kept so the updater can answer from
 * disk instead of spending the unauthenticated GitHub API budget (60 requests
 * per hour, per IP) on every app launch.
 */
export type AppUpdateLookupState = {
  checkedAt: ISODateTime
  /** ETag of the response the release was read from; replayed as `If-None-Match` so an unchanged release costs no rate-limit budget. */
  etag: string | null
  release: GitHubReleaseMeta | null
}

export type AppearanceMode = "light" | "dark" | "system"
export type FontSize = "small" | "normal" | "large"

/** UI preferences. */
export type TypographySettings = {
  fontSize: FontSize
}

/** Everything this device needs to talk to one Daily Sync Server. Lives in `device_settings`, never in a snapshot. */
export type ServerSyncBinding = {
  baseUrl: string
  serverId: string
  serverName: string
  deviceId: string
  deviceName: string
  token: string
  /** SHA-256 of the pinned certificate, uppercase colon-separated as `tls` reports it. Null for plain HTTP and for a chain that validates against the system store. */
  fingerprint: string | null
  /** True when the binding was made over plain HTTP. Permanent for the life of the binding. */
  insecure: boolean
  boundAt: string
}

/** Remote synchronization configuration. */
export type SyncSettings = {
  iCloud: {
    enabled: boolean
  }
  server: {
    enabled: boolean
    binding: ServerSyncBinding | null
  }
}

export type Settings = {
  version: string
  appearance: {
    mode: AppearanceMode
    accent: string
    base: string
  }
  typography: TypographySettings
  sync: SyncSettings
  ai: AIConfig | null
  branch: {
    activeId: Branch["id"]
  }
  layout: {
    /** Hide sections with no tasks. */
    sectionsHideEmpty: boolean
    /** Auto-collapse sections with no tasks. */
    sectionsAutoCollapseEmpty: boolean
    /** Manual collapse state per board column; the backlog has no collapse state. */
    sectionsCollapsed: Record<BoardStatus, boolean>
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
    /**
     * Last release lookup answered by GitHub, used to skip redundant API calls.
     */
    lookup: AppUpdateLookupState | null
  }
}

/**
 * `Settings` as it crosses to the renderer: identical except that the server binding arrives
 * without the credential that authenticates it. The stored `ServerSyncBinding` keeps that
 * credential — the storage layer reads it from `device_settings`; only what leaves the
 * main process is narrowed.
 */
export type SettingsView = Omit<Settings, "sync"> & {
  sync: Omit<SyncSettings, "server"> & {
    server: {enabled: boolean; binding: ServerBindingView | null}
  }
}

/** The day, time and timezone a task is placed on. */
export type TaskSchedule = {
  date: ISODate
  time: ISOTime
  timezone: Timezone
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
  /** Milestone ID; null when the task isn't assigned to one. */
  milestoneId: Milestone["id"] | null

  /** Null when the task has no day and waits in the backlog. */
  scheduled: TaskSchedule | null
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
  status: TaskStatus
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

export type Milestone = {
  id: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null

  branchId: Branch["id"]
  name: string
  date: ISODate | null
  description: string | null
}

export type MilestoneProgress = {done: number; total: number; percent: number}
export type MilestoneWithProgress = Milestone & {progress: MilestoneProgress}

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

export type TaskEventType = "created" | "completed" | "discarded" | "reactivated" | "backlogged" | "edited" | "deleted" | "restored" | "moved"

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
  activeDay?: ISODate
}
