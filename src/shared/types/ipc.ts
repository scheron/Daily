/// <reference types="node" />
import type {PartialDeep} from "type-fest"
import type {ISODate} from "./common"
import type {TaskSearchResult} from "./search"
import type {Day, File, Settings, SyncStatus, Tag, Task} from "./storage"

export interface BridgeIPC {
  // === GENERAL IPC ===
  invoke: (channel: string, ...args: any[]) => Promise<any>
  send: (channel: string, ...args: any[]) => void
  on: (channel: string, callback: (...args: any[]) => void) => () => void

  "window:minimize": () => void
  "window:maximize": () => void
  "window:close": () => void

  "platform:is-mac": () => boolean
  "platform:is-windows": () => boolean
  "platform:is-linux": () => boolean

  // === SHELL ===
  "shell:open-external": (url: string) => Promise<boolean>

  // === WINDOW MENU SHORTCUTS ===
  /**@deprecated remote with menu*/
  "menu:on-new-task": (callback: (action: "new-task") => void) => void

  // === STORAGE  ===
  "storage-sync:activate": () => Promise<void>
  "storage-sync:deactivate": () => Promise<void>
  "storage-sync:sync": () => Promise<void>
  "storage-sync:get-status": () => Promise<SyncStatus>
  "storage-sync:on-status-changed": (callback: (status: SyncStatus, prevStatus: SyncStatus) => void) => void
  "storage-sync:on-data-changed": (callback: () => void) => void

  // === SETTINGS ===
  "settings:load": () => Promise<Settings>
  "settings:save": (settings: Partial<Settings>) => Promise<void>

  // === DAYS  ===
  "days:get-many": (params?: {from?: ISODate; to?: ISODate}) => Promise<Day[]>
  "days:get-one": (date: ISODate) => Promise<Day | null>

  // === TASKS  ===
  "tasks:get-many": (params?: {from?: ISODate; to?: ISODate; limit?: number}) => Promise<Task[]>
  "tasks:get-one": (id: Task["id"]) => Promise<Task | null>
  "tasks:update": (id: Task["id"], updates: PartialDeep<Task>) => Promise<Task | null>
  "tasks:create": (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "deletedAt" | "attachments">) => Promise<Task | null>
  "tasks:delete": (id: Task["id"]) => Promise<boolean>
  "tasks:add-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => Promise<Task | null>
  "tasks:remove-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => Promise<Task | null>

  // === SEARCH  ===
  "search:query": (query: string) => Promise<TaskSearchResult[]>

  // === TAGS  ===
  "tags:get-many": () => Promise<Tag[]>
  "tags:get-one": (id: Tag["id"]) => Promise<Tag | null>
  "tags:update": (id: Tag["id"], updates: Partial<Tag>) => Promise<Tag | null>
  "tags:create": (tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">) => Promise<Tag | null>
  "tags:delete": (id: Tag["id"]) => Promise<boolean>

  // === FILES ===
  "files:save": (filename: string, data: Buffer) => Promise<File["id"]>
  "files:delete": (filename: string) => Promise<boolean>
  "files:get-path": (id: File["id"]) => Promise<string>
}
