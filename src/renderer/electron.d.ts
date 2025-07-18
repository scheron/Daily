import type {Settings} from "@/types/settings"
import type {StorageSyncEvent} from "@/types/storage"
import type {Tag, Task} from "@/types/tasks"
import type {Buffer} from "buffer"

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

  // === ASSETS ===
  getAssetPath: (filename: string) => Promise<string>
  saveAsset: (filename: string, data: Buffer) => Promise<string>
  deleteAsset: (filename: string) => Promise<boolean>

  // === SETTINGS ===
  getSettings: () => Promise<Partial<Settings>>
  saveSettings: (settings: Partial<Settings>) => Promise<void>

  // === STORAGE ===
  getStoragePath: (pretty?: boolean) => Promise<string>
  selectStoragePath: (removeOld?: boolean) => Promise<string>

  onStorageSync: (callback: (event: StorageSyncEvent) => void) => void
  onStorageSyncStatus: (callback: (event: {isSyncing: boolean}) => void) => void
  syncStorage: () => Promise<boolean>

  // === DATA ===
  loadTasks: () => Promise<Task[]>
  saveTasks: (tasks: Task[]) => Promise<void>
  deleteTask: (id: Task["id"]) => Promise<boolean>

  loadTags: () => Promise<Tag[]>
  saveTags: (tags: Tag[]) => Promise<void>

  loadAllData: () => Promise<{tasks: Task[]; tags: Tag[]}>

  // === MENU ===
  onMenuAction: (callback: (action: "new-task") => void) => void

  // === DEBUG ===
  consoleElectron: (...args: any[]) => void
}

declare global {
  interface Window {
    electronAPI: ElectronApi
  }
}
