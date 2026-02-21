import type {Buffer} from "buffer"
import type {PartialDeep} from "type-fest"
import type {AIConfig, AIResponse, LocalModelDownloadProgress, LocalModelId, LocalModelInfo, LocalRuntimeState} from "./ai"
import type {ISODate} from "./common"
import type {TaskSearchResult} from "./search"
import type {Day, File, MoveTaskByOrderParams, Settings, SyncStatus, Tag, Task} from "./storage"

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
  "tasks:toggle-minimized": (id: Task["id"], minimized: boolean) => Promise<Task | null>
  "tasks:create": (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "deletedAt" | "attachments">) => Promise<Task | null>
  "tasks:move-by-order": (params: MoveTaskByOrderParams) => Promise<Task | null>
  "tasks:delete": (id: Task["id"]) => Promise<boolean>
  "tasks:add-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => Promise<Task | null>
  "tasks:remove-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => Promise<Task | null>
  "tasks:get-deleted": (params?: {limit?: number}) => Promise<Task[]>
  "tasks:restore": (id: Task["id"]) => Promise<Task | null>
  "tasks:delete-permanently": (id: Task["id"]) => Promise<boolean>

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

  // === AI ===
  "ai:check-connection": () => Promise<boolean>
  "ai:list-models": () => Promise<string[]>
  "ai:send-message": (message: string) => Promise<AIResponse>
  "ai:cancel": () => Promise<boolean>
  "ai:clear-history": () => Promise<boolean>
  "ai:update-config": (config: Partial<AIConfig>) => Promise<boolean>

  // === AI LOCAL MODEL MANAGEMENT ===
  "ai:local-list-models": () => Promise<LocalModelInfo[]>
  "ai:local-download-model": (modelId: LocalModelId) => Promise<boolean>
  "ai:local-cancel-download": (modelId: LocalModelId) => Promise<boolean>
  "ai:local-delete-model": (modelId: LocalModelId) => Promise<boolean>
  "ai:local-get-state": () => Promise<LocalRuntimeState>
  "ai:local-get-disk-usage": () => Promise<{total: number; models: Record<string, number>}>

  // === AI LOCAL EVENTS ===
  "ai:on-local-state-changed": (callback: (state: LocalRuntimeState) => void) => void
  "ai:on-local-download-progress": (callback: (progress: LocalModelDownloadProgress) => void) => void

  // === SHORTCUTS ===
  "shortcut:tasks:create": (callback: () => void) => void
  "shortcut:ui:toggle-sidebar": (callback: () => void) => void
  "shortcut:ui:open-calendar-panel": (callback: () => void) => void
  "shortcut:ui:open-tags-panel": (callback: () => void) => void
  "shortcut:ui:open-search-panel": (callback: () => void) => void
  "shortcut:ui:open-assistant-panel": (callback: () => void) => void
  "shortcut:ui:open-settings-panel": (callback: () => void) => void
  "shortcut:ui:toggle-tasks-view-mode": (callback: () => void) => void
}
