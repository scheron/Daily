import {ipcMain} from "electron"

import type {PartialDeep} from "type-fest"
import type {ISODate, IStorageController, Tag, Task} from "../../types.js"

import {syncStorage} from "../app/storage.js"

export function setupStorageIPC(getStorage: () => IStorageController): void {
  ipcMain.handle("load-settings", (_e) => getStorage().loadSettings())
  ipcMain.handle("save-settings", (_e, newSettings: Partial<Record<string, any>>) => getStorage().saveSettings(newSettings))

  ipcMain.handle("get-days", (_e, params?: {from?: ISODate; to?: ISODate}) => getStorage().getDays(params))
  ipcMain.handle("get-day", (_e, date: ISODate) => getStorage().getDay(date))

  ipcMain.handle("get-task-list", (_e, params?: {from?: ISODate; to?: ISODate}) => getStorage().getTaskList(params))
  ipcMain.handle("get-task", (_e, id: Task["id"]) => getStorage().getTask(id))
  ipcMain.handle("update-task", (_e, id: Task["id"], updates: PartialDeep<Task>) => getStorage().updateTask(id, updates))
  ipcMain.handle("create-task", (_e, task: Task) => getStorage().createTask(task))
  ipcMain.handle("delete-task", (_e, id: Task["id"]) => getStorage().deleteTask(id))

  ipcMain.handle("get-tag-list", () => getStorage().getTagList())
  ipcMain.handle("get-tag", (_e, name: Tag["name"]) => getStorage().getTag(name))
  ipcMain.handle("update-tag", (_e, name: Tag["name"], tag: Tag) => getStorage().updateTag(name, tag))
  ipcMain.handle("create-tag", (_e, tag: Tag) => getStorage().createTag(tag))
  ipcMain.handle("delete-tag", (_e, name: Tag["name"]) => getStorage().deleteTag(name))

  ipcMain.handle("add-task-tags", (_e, taskId: Task["id"], tagNames: Tag["name"][]) => getStorage().addTaskTags(taskId, tagNames))
  ipcMain.handle("remove-task-tags", (_e, taskId: Task["id"], tagNames: Tag["name"][]) => getStorage().removeTaskTags(taskId, tagNames))

  ipcMain.handle("save-file", (_e, filename: string, data: any) => getStorage().saveFile(filename, Buffer.isBuffer(data) ? data : Buffer.from(data)))
  ipcMain.handle("delete-file", (_e, filename: string) => getStorage().deleteFile(filename))
  ipcMain.handle("get-file-path", (_e, id: string) => getStorage().getFilePath(id))

  ipcMain.handle("sync-storage", async (_e) => {
    try {
      await syncStorage(getStorage())
      return true
    } catch (error) {
      console.error("Failed to sync storage:", error)
      return false
    }
  })
}
