import {ipcMain} from "electron"

import type {PartialDeep} from "type-fest"
import type {ISODate, IStorageController, Tag, Task} from "../../types.js"

import {syncStorage} from "../app/storage.js"

export function setupStorageIPC(storage: IStorageController): void {
  if (!storage) throw new Error("Storage is not initialized")

  ipcMain.handle("load-settings", (_e) => storage.loadSettings())
  ipcMain.handle("save-settings", (_e, newSettings: Partial<Record<string, any>>) => storage.saveSettings(newSettings))

  ipcMain.handle("get-days", (_e, params?: {from?: ISODate; to?: ISODate}) => storage.getDays(params))
  ipcMain.handle("get-day", (_e, date: ISODate) => storage.getDay(date))

  ipcMain.handle("get-task-list", (_e, params?: {from?: ISODate; to?: ISODate}) => storage.getTaskList(params))
  ipcMain.handle("get-task", (_e, id: Task["id"]) => storage.getTask(id))
  ipcMain.handle("update-task", (_e, id: Task["id"], updates: PartialDeep<Task>) => storage.updateTask(id, updates))
  ipcMain.handle("create-task", (_e, task: Task) => storage.createTask(task))
  ipcMain.handle("delete-task", (_e, id: Task["id"]) => storage.deleteTask(id))

  ipcMain.handle("get-tag-list", () => storage.getTagList())
  ipcMain.handle("get-tag", (_e, name: Tag["name"]) => storage.getTag(name))
  ipcMain.handle("update-tag", (_e, name: Tag["name"], tag: Tag) => storage.updateTag(name, tag))
  ipcMain.handle("create-tag", (_e, tag: Tag) => storage.createTag(tag))
  ipcMain.handle("delete-tag", (_e, name: Tag["name"]) => storage.deleteTag(name))

  ipcMain.handle("add-task-tags", (_e, taskId: Task["id"], tagNames: Tag["name"][]) => storage.addTaskTags(taskId, tagNames))
  ipcMain.handle("remove-task-tags", (_e, taskId: Task["id"], tagNames: Tag["name"][]) => storage.removeTaskTags(taskId, tagNames))

  ipcMain.handle("save-file", (_e, filename: string, data: any) => storage.saveFile(filename, Buffer.isBuffer(data) ? data : Buffer.from(data)))
  ipcMain.handle("delete-file", (_e, filename: string) => storage.deleteFile(filename))
  ipcMain.handle("get-file-path", (_e, id: string) => storage.getFilePath(id))

  ipcMain.handle("sync-storage", async (_e) => {
    try {
      await syncStorage(storage)
      return true
    } catch (error) {
      console.error("Failed to sync storage:", error)
      return false
    }
  })
}
