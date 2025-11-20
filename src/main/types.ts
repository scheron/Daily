import type {PartialDeep} from "type-fest"

export type ISODate = string
export type ISOTime = string
export type ISODateTime = string
export type Timezone = string
export type ID = string

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
}

export type Task = {
  createdAt: ISODateTime
  updatedAt: ISODateTime

  /** Task ID (task:ID) */
  id: ID

  scheduled: {
    date: ISODate
    time: ISOTime
    timezone: Timezone
  }

  estimatedTime: number
  spentTime: number

  content: string
  status: "active" | "done" | "discarded"
  tags: Tag[]
  /** Files IDs  */
  attachments: string[]
}

export type TaskInternal = {
  createdAt: ISODateTime
  updatedAt: ISODateTime

  /** Task ID (task:ID) */
  id: ID

  scheduled: {
    date: ISODate
    time: ISOTime
    timezone: Timezone
  }

  estimatedTime: number
  spentTime: number

  content: string
  status: "active" | "done" | "discarded"
  tags: string[]
  /** File IDs (e.g., "abc123") - use getFilePath to convert to URL */
  attachments: string[]
}

export type Tag = {
  name: string
  color: string
  /** @deprecated Remove in future */
  emoji: string
}

export type File = {
  id: ID
  name: string
  mimeType: string
  size: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

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

export interface IStorageController {
  rootDir: string
  init(): Promise<void>

  getTaskList(): Promise<Task[]>
  getTask(id: Task["id"]): Promise<Task | null>
  updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null>
  createTask(task: Task): Promise<Task | null>
  deleteTask(id: Task["id"]): Promise<boolean>

  getTagList(): Promise<Tag[]>
  getTag(name: Tag["name"]): Promise<Tag | null>
  updateTag(name: Tag["name"], tag: Tag): Promise<Tag | null>
  createTag(tag: Tag): Promise<Tag | null>
  deleteTag(name: Tag["name"]): Promise<boolean>

  addTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null>
  removeTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null>

  addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null>
  removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null>

  loadSettings(): Promise<Settings>
  saveSettings(newSettings: Partial<Settings>): Promise<void>

  saveFile(filename: string, data: Buffer): Promise<File["id"]>
  getFilePath(id: File["id"]): string
  deleteFile(fileId: File["id"]): Promise<boolean>
  getFiles(fileIds: File["id"][]): Promise<File[]>
  createFileResponse(id: File["id"]): Promise<Response>

  cleanupOrphanFiles(): Promise<void>

  syncStorage(): Promise<void>
}

export type StorageSyncEvent = {
  type: "tasks" | "tags" | "settings"
}

export type TaskEvent = {
  type: "saved" | "deleted"
}

export type StorageSyncStatusEvent = {
  isSyncing: boolean
}

/**
 * Creates a new type by renaming a property key `KOld` in type `T` to a new key `KNew`.
 * The value type remains the same.
 *
 * @template T - The source object type
 * @template KOld - The key in T to rename
 * @template KNew - The new key name
 * @example
 * type Foo = { a: number, b: string }
 * type Bar = Rename<Foo, "a", "x"> // { b: string, x: number }
 */
export type ReplaceKey<T, KOld extends keyof T, KNew extends PropertyKey> = Omit<T, KOld> & {[P in KNew]: T[KOld]}

type Identity<T> = {[P in keyof T]: T[P]}
/**
 * Creates a new type by replacing the value of a property key `K` in type `T`
 * with a new value of type `TReplace`.
 *
 * @template T - The source object type
 * @template K - The key in T to replace
 * @template TReplace - The value type for the new key
 * @example
 * type Foo = { a: number, b: string }
 * type Bar = ReplaceValue<Foo, "a", boolean> // { a: boolean, b: string }
 */
export type ReplaceValue<T, K extends keyof T, TReplace> = Identity<Omit<T, K> & {[P in K]: TReplace}>

/**
 * Creates a new type by replacing the property key `OldKey` in type `T`
 * with a new property `NewKey` of type `NewValue`.
 *
 * @template T - The source object type
 * @template OldKey - The key in T to replace
 * @template NewKey - The new key name
 * @template NewValue - The value type for the new key
 * @example
 * type Foo = { a: number, b: string }
 * type Bar = Replace<Foo, "a", "x", boolean> // { x: boolean, b: string }
 */
export type Replace<T, OldKey extends keyof T, NewKey extends PropertyKey, NewValue> = {
  [K in keyof T as K extends OldKey ? NewKey : K]: K extends OldKey ? NewValue : T[K]
}
