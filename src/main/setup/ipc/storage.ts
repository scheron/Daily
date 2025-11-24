import {ipcMain} from "electron"

import type {IStorageController} from "@/types/storage"
import type {ISODate} from "@shared/types/common"
import type {Tag, Task} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

export function setupStorageIPC(getStorage: () => IStorageController | null): void {
  ipcMain.handle("load-settings", (_e) => getStorage()?.loadSettings())
  ipcMain.handle("save-settings", (_e, newSettings: Partial<Record<string, any>>) => getStorage()?.saveSettings(newSettings))

  ipcMain.handle("get-days", (_e, params?: {from?: ISODate; to?: ISODate}) => getStorage()?.getDays(params))
  ipcMain.handle("get-day", (_e, date: ISODate) => getStorage()?.getDay(date))

  ipcMain.handle("get-task-list", (_e, params?: {from?: ISODate; to?: ISODate; limit?: number}) => getStorage()?.getTaskList(params))
  ipcMain.handle("get-task", (_e, id: Task["id"]) => getStorage()?.getTask(id))
  ipcMain.handle("update-task", (_e, id: Task["id"], updates: PartialDeep<Task>) => getStorage()?.updateTask(id, updates))
  ipcMain.handle("create-task", (_e, task: Omit<Task, "id" | "createdAt" | "updatedAt">) => getStorage()?.createTask(task))
  ipcMain.handle("delete-task", (_e, id: Task["id"]) => getStorage()?.deleteTask(id))

  ipcMain.handle("get-tag-list", () => getStorage()?.getTagList())
  ipcMain.handle("get-tag", (_e, id: Tag["id"]) => getStorage()?.getTag(id))
  ipcMain.handle("update-tag", (_e, id: Tag["id"], updates: Partial<Tag>) => getStorage()?.updateTag(id, updates))
  ipcMain.handle("create-tag", (_e, tag: Omit<Tag, "id" | "createdAt" | "updatedAt">) => getStorage()?.createTag(tag))
  ipcMain.handle("delete-tag", (_e, id: Tag["id"]) => getStorage()?.deleteTag(id))

  ipcMain.handle("add-task-tags", (_e, taskId: Task["id"], tags: Tag["id"][]) => getStorage()?.addTaskTags(taskId, tags))
  ipcMain.handle("remove-task-tags", (_e, taskId: Task["id"], tags: Tag["id"][]) => getStorage()?.removeTaskTags(taskId, tags))

  ipcMain.handle("save-file", (_e, filename: string, data: any) => getStorage()?.saveFile(filename, Buffer.isBuffer(data) ? data : Buffer.from(data)))
  ipcMain.handle("delete-file", (_e, filename: string) => getStorage()?.deleteFile(filename))
  ipcMain.handle("get-file-path", (_e, id: string) => getStorage()?.getFilePath(id))

  ipcMain.handle("storage:activate-sync", (_e) => getStorage()?.activateSync())
  ipcMain.handle("storage:deactivate-sync", (_e) => getStorage()?.deactivateSync())
  ipcMain.handle("storage:force-sync", (_e) => getStorage()?.forceSync())
  ipcMain.handle("storage:get-sync-status", (_e) => getStorage()?.getSyncStatus())
}
