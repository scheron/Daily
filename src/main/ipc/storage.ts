import {dialog, ipcMain} from "electron"

import type {StorageManager} from "../services/storage-manager.js"
import type {DayItem, ExportTaskData, Task} from "../types.js"

export function setupStorageIPC(storage: StorageManager): void {
  if (!storage) {
    throw new Error("Storage is not initialized")
  }

  ipcMain.handle("get-settings", () => storage.getSettings())
  ipcMain.handle("save-settings", (_e, newSettings: Partial<Record<string, any>>) => storage.saveSettings(newSettings))

  ipcMain.handle("load-tasks", () => storage.loadTasks())
  ipcMain.handle("save-tasks", (_e, tasks: Task[]) => storage.saveTasks(tasks))

  ipcMain.handle("load-days", () => storage.loadDays())
  ipcMain.handle("save-days", (_e, days: DayItem[]) => storage.saveDays(days))

  ipcMain.handle("load-all-data", () => {
    const startTime = Date.now()
    const tasks = storage.loadTasks()
    const days = storage.loadDays()
    const endTime = Date.now()

    console.log(`🚀 load-all-data completed in ${endTime - startTime}ms (${tasks.length} tasks, ${days.length} days)`)

    return {tasks, days}
  })

  ipcMain.handle("export-data", async (_e, exportData: ExportTaskData[]) => {
    const result = await dialog.showOpenDialog({properties: ["openDirectory"], title: "Select folder to export tasks"})
    if (result.canceled || !result.filePaths.length) return false

    return storage.exportTasks(exportData, result.filePaths[0])
  })

  ipcMain.handle("get-storage-info", () => {
    try {
      const info = storage.getStorageInfo()
      return {success: true, info}
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {success: false, error: errorMessage}
    }
  })
}
