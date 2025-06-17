import type {Settings} from "@/types/settings"
import type {DayItem, Tag, Task} from "@/types/tasks"
import type {Buffer} from "buffer"
import type {ExportTaskData} from "../main/types"

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

  /* === ASSETS === */
  saveAsset: (filename: string, data: Buffer) => Promise<string>
  getAssetPath: (filename: string) => Promise<string>
  deleteAsset: (filename: string) => Promise<boolean>

  /* === SETTINGS === */
  getSettings: () => Promise<Partial<Settings>>
  saveSettings: (settings: Partial<Settings>) => Promise<void>

  /* === DATA === */
  loadTasks: () => Promise<Task[]>
  saveTasks: (tasks: Task[]) => Promise<void>

  loadDays: () => Promise<DayItem[]>
  saveDays: (days: DayItem[]) => Promise<void>

  loadTags: () => Promise<Tag[]>
  saveTags: (tags: Tag[]) => Promise<void>

  loadAllData: () => Promise<{tasks: Task[]; days: DayItem[]; tags: Tag[]}>

  exportData: (exportData: ExportTaskData[]) => Promise<boolean>

  getStorageInfo: () => Promise<string>

  /* === MENU === */
  onMenuAction: (callback: (action: "new-task" | "open-settings" | "export-data") => void) => void

  /* === UPDATES === */
  checkForUpdates: () => Promise<{hasUpdate: boolean; version: string | null}>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => Promise<boolean>

  onUpdateDownloaded: (callback: (version: string) => void) => void
  onUpdateCheck: (callback: (hasUpdate: boolean, version: string | null) => void) => void
  onUpdateInstall: (callback: () => void) => void

  removeAllListeners(channel: string): void
}

declare global {
  interface Window {
    electronAPI: ElectronApi
  }
}
