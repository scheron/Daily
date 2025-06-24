import {ipcMain} from "electron"

import type {StorageManager, Tag, Task} from "../types.js"

import {syncStorage} from "../services/storage-events.js"

export function setupStorageIPC(storage: StorageManager): void {
  if (!storage) {
    throw new Error("Storage is not initialized")
  }

  ipcMain.handle("get-settings", () => storage.loadSettings())
  ipcMain.handle("save-settings", (_e, newSettings: Partial<Record<string, any>>) => storage.saveSettings(newSettings))

  ipcMain.handle("load-tasks", () => storage.loadTasks())
  ipcMain.handle("save-tasks", (_e, tasks: Task[]) => storage.saveTasks(tasks))
  ipcMain.handle("delete-task", (_e, id: Task["id"]) => storage.deleteTask(id))

  ipcMain.handle("load-days", () => [])
  ipcMain.handle("save-days", () => {})

  ipcMain.handle("load-tags", () => storage.loadTags())
  ipcMain.handle("save-tags", (_e, tags: Tag[]) => storage.saveTags(tags))

  ipcMain.handle("load-all-data", async () => {
    const startTime = Date.now()
    const tasks = await storage.loadTasks()
    const tags = await storage.loadTags()
    const endTime = Date.now()

    console.log(`🚀 load-all-data completed in ${endTime - startTime}ms (${tasks.length} tasks, ${tags.length} tags)`)

    return {tasks, tags}
  })

  ipcMain.handle("sync-storage", async () => {
    try {
      await syncStorage(storage)
      return true
    } catch (error) {
      console.error("Failed to sync storage:", error)
      return false
    }
  })

  ipcMain.handle("cleanup-orphaned-entries", async () => {
    try {
      return await storage.cleanupOrphanedEntries()
    } catch (error) {
      console.error("Failed to cleanup orphaned entries:", error)
      return {removedTasks: 0}
    }
  })

  ipcMain.handle("save-asset", async (_e, filename: string, data: Buffer) => {
    try {
      return await storage.saveAsset(filename, data)
    } catch (error) {
      console.error("Failed to save asset:", error)
      return false
    }
  })

  ipcMain.handle("get-asset-path", async (_e, filename: string) => {
    try {
      return filename
    } catch (error) {
      console.error("Failed to get asset path:", error)
      return ""
    }
  })

  ipcMain.handle("delete-asset", async (_e, filename: string) => {
    try {
      await storage.deleteAsset(filename)
      return true
    } catch (error) {
      console.error("Failed to delete asset:", error)
      return false
    }
  })

  ipcMain.handle("get-storage-path", (_e, pretty = false) => storage.getStoragePath(pretty))
  ipcMain.handle("select-storage-path", (_e, removeOld = false) => storage.selectStoragePath(removeOld))
}
