import type { Settings } from "@/types/settings"
import type { Tag, Task } from "@/types/tasks"
import type { Buffer } from "buffer"

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

  // === DATA ===
  loadTasks: () => Promise<Task[]>
  saveTasks: (tasks: Task[]) => Promise<void>

  loadTags: () => Promise<Tag[]>
  saveTags: (tags: Tag[]) => Promise<void>

  loadAllData: () => Promise<{tasks: Task[]; tags: Tag[]}>

  // === MENU ===
  onMenuAction: (callback: (action: "new-task") => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronApi
  }
}
