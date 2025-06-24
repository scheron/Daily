export type ISODate = string
export type ISOTime = string
export type ISODateTime = string
export type Timezone = string
export type ID = string

export type MetaFile = {
  version: string
  tasks: Record<ID, MetaTask>
  tags: Record<string, MetaTag>
}

export type MetaTask = {
  id: ID

  file: string
  hash: string

  scheduled: {
    date: ISODate
    time: ISOTime
    timezone: Timezone
  }

  tags: Tag["name"][]

  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type MetaTag = {
  name: string
  color: string
  emoji: string
}

export type Settings = {
  version: string
  themes: {
    current: string
    preferred_light: string
    preferred_dark: string
    use_system: boolean
  }
  sidebar: {
    collapsed: boolean
  }

  paths: {
    root: string
  }
}

export type Task = {
  createdAt: ISODateTime
  updatedAt: ISODateTime

  id: ID

  file: string
  hash: string

  scheduled: {
    date: ISODate
    time: ISOTime
    timezone: Timezone
  }

  content: string
  status: "active" | "done" | "discarded"
  tags: Tag[]
}

export type Tag = MetaTag

export type Day = {
  id: ID
  date: ISODate
  tasks: Task[]
  tags: Tag[]
  countActive: number
  countDone: number
}

export type StoreSchema = {
  settings: Settings
  tasks: Task[]
  tags: Tag[]
}

export interface StorageManager {
  rootDir: string
  metaPath: string
  configPath: string
  assetsDir: string

  init(): Promise<void>

  loadTasks(): Promise<Task[]>
  saveTasks(tasks: Task[]): Promise<void>
  deleteTask(id: ID): Promise<boolean>
  loadTags(): Promise<Tag[]>
  saveTags(tags: Tag[]): Promise<void>

  loadSettings(): Promise<Settings>
  saveSettings(newSettings: Partial<Settings>): Promise<void>

  saveAsset(filename: string, data: Buffer): Promise<string>
  deleteAsset(filename: string): Promise<void>
  getAssetPath(filename: string): Promise<string>
  getAssetResponse(fileUrl: string): Promise<Response>

  syncStorage(): Promise<void>

  getStoragePath(pretty?: boolean): Promise<string>
  selectStoragePath(removeOld?: boolean): Promise<boolean>
}

export type StorageSyncEvent = {
  type: "tasks" | "tags" | "settings"
}

export type StorageSyncStatusEvent = {
  isSyncing: boolean
}
