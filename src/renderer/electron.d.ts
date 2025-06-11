import type {Settings} from "@/types/settings"
import type {DayItem, Tag, Task} from "@/types/tasks"

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

  getSettings: () => Promise<Settings>
  saveSettings: (settings: Partial<Settings>) => Promise<void>

  loadTasks: () => Promise<Task[]>
  saveTasks: (tasks: Task[]) => Promise<void>

  loadDays: () => Promise<DayItem[]>
  saveDays: (days: DayItem[]) => Promise<void>

  loadTags: () => Promise<Tag[]>
  saveTags: (tags: Tag[]) => Promise<void>

  loadAllData: () => Promise<{tasks: Task[]; days: DayItem[]; tags: Tag[]}>

  onMenuAction: (callback: (action: "new-task" | "open-settings" | "export-data") => void) => void

  exportData: (
    exportData: Array<{
      date: string
      tasks: Array<{
        filename: string
        content: string
      }>
    }>,
  ) => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: ElectronApi
  }
}
