import type {ISODate} from "@/types/date"
import type {Settings} from "@/types/settings"
import type {StorageSyncEvent} from "@/types/storage"
import type {Day, Tag, Task} from "@/types/tasks"
import type {Buffer} from "buffer"
import type {PartialDeep} from "type-fest"

/**
 * Should match main/preload.ts for typescript support in renderer
 */
export default interface ElectronApi {
  minimize: () => void
  maximize: () => void
  close: () => void

  platform: {
    isMac: () => boolean
    isWindows: () => boolean
    isLinux: () => boolean
  }

  // === FILES ===
  saveFile: (filename: string, data: Buffer) => Promise<string>
  getFilePath: (id: string) => Promise<string>
  deleteFile: (filename: string) => Promise<boolean>

  // === SETTINGS ===
  loadSettings: () => Promise<Settings>
  saveSettings: (settings: Partial<Settings>) => Promise<void>

  // === STORAGE ===
  onStorageSync: (callback: (event: StorageSyncEvent) => void) => void
  onStorageSyncStatus: (callback: (event: {isSyncing: boolean}) => void) => void
  syncStorage: () => Promise<boolean>

  // === TASK EVENTS ===
  onTaskSaved: (callback: (task: Task) => void) => void
  onTaskDeleted: (callback: (taskId: Task["id"]) => void) => void

  // === DATA ===
  getDays: (params?: {from?: ISODate; to?: ISODate}) => Promise<Day[]>
  getDay: (date: ISODate) => Promise<Day | null>

  getTaskList: (params?: {from?: ISODate; to?: ISODate; limit?: number}) => Promise<Task[]>
  getTask: (id: Task["id"]) => Promise<Task | null>
  updateTask: (id: Task["id"], updates: PartialDeep<Task>) => Promise<Task | null>
  createTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => Promise<Task | null>
  deleteTask: (id: Task["id"]) => Promise<boolean>

  getTagList: () => Promise<Tag[]>
  getTag: (name: Tag["name"]) => Promise<Tag | null>
  updateTag: (name: Tag["name"], tag: Tag) => Promise<Tag | null>
  createTag: (tag: Tag) => Promise<Tag | null>
  deleteTag: (name: Tag["name"]) => Promise<boolean>

  addTaskTags: (taskId: Task["id"], tagNames: Tag["name"][]) => Promise<Task | null>
  removeTaskTags: (taskId: Task["id"], tagNames: Tag["name"][]) => Promise<Task | null>

  // === MENU ===
  onMenuAction: (callback: (action: "new-task") => void) => void

  // === TIMER ===
  closeTimerWindow: () => void
  openTimerWindow: (taskId: Task["id"]) => void
  onRefreshTimerWindow: (callback: (taskId: Task["id"]) => void) => void

  // === GENERAL IPC ===
  invoke: (channel: string, ...args: any[]) => Promise<any>
  send: (channel: string, ...args: any[]) => void
  on: (channel: string, callback: (...args: any[]) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronApi
  }
}
