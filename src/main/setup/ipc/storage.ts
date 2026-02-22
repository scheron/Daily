import {ipcMain} from "electron"

import type {IStorageController} from "@/types/storage"
import type {ISODate} from "@shared/types/common"
import type {MoveTaskByOrderParams, Tag, Task} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

// prettier-ignore
export function setupStorageIPC(getStorage: () => IStorageController | null): void {
  ipcMain.handle("settings:load", (_e) => getStorage()?.loadSettings())
  ipcMain.handle("settings:save", (_e, newSettings: Partial<Record<string, any>>) => getStorage()?.saveSettings(newSettings))

  ipcMain.handle("days:get-many", (_e, params?: {from?: ISODate; to?: ISODate}) => getStorage()?.getDays(params))
  ipcMain.handle("days:get-one", (_e, date: ISODate) => getStorage()?.getDay(date))

  ipcMain.handle("tasks:get-many", (_e, params?: {from?: ISODate; to?: ISODate; limit?: number}) => getStorage()?.getTaskList(params))
  ipcMain.handle("tasks:get-one", (_e, id: Task["id"]) => getStorage()?.getTask(id))
  ipcMain.handle("tasks:update", (_e, id: Task["id"], updates: PartialDeep<Task>) => getStorage()?.updateTask(id, updates))
  ipcMain.handle("tasks:toggle-minimized", (_e, id: Task["id"], minimized: boolean) => getStorage()?.toggleTaskMinimized(id, minimized))
  ipcMain.handle("tasks:create", (_e, task: Omit<Task, "id" | "createdAt" | "updatedAt">) => getStorage()?.createTask(task))
  ipcMain.handle("tasks:move-by-order", (_e, params: MoveTaskByOrderParams) => getStorage()?.moveTaskByOrder(params))
  ipcMain.handle("tasks:delete", (_e, id: Task["id"]) => getStorage()?.deleteTask(id))
  ipcMain.handle("tasks:get-deleted", (_e, params?: {limit?: number}) => getStorage()?.getDeletedTasks(params))
  ipcMain.handle("tasks:restore", (_e, id: Task["id"]) => getStorage()?.restoreTask(id))
  ipcMain.handle("tasks:delete-permanently", (_e, id: Task["id"]) => getStorage()?.permanentlyDeleteTask(id))
  ipcMain.handle("tasks:delete-all-permanently", () => getStorage()?.permanentlyDeleteAllDeletedTasks())

  ipcMain.handle("search:query", (_e, query: string) => getStorage()?.searchTasks(query))

  ipcMain.handle("tags:get-many", () => getStorage()?.getTagList())
  ipcMain.handle("tags:get-one", (_e, id: Tag["id"]) => getStorage()?.getTag(id))
  ipcMain.handle("tags:update", (_e, id: Tag["id"], updates: Partial<Tag>) => getStorage()?.updateTag(id, updates))
  ipcMain.handle("tags:create", (_e, tag: Omit<Tag, "id" | "createdAt" | "updatedAt">) => getStorage()?.createTag(tag))
  ipcMain.handle("tags:delete", (_e, id: Tag["id"]) => getStorage()?.deleteTag(id))

  ipcMain.handle("tasks:add-tags", (_e, taskId: Task["id"], tags: Tag["id"][]) => getStorage()?.addTaskTags(taskId, tags))
  ipcMain.handle("tasks:remove-tags", (_e, taskId: Task["id"], tags: Tag["id"][]) => getStorage()?.removeTaskTags(taskId, tags))

  ipcMain.handle("files:save", (_e, filename: string, data: any) => getStorage()?.saveFile(filename, Buffer.isBuffer(data) ? data : Buffer.from(data)))
  ipcMain.handle("files:delete", (_e, filename: string) => getStorage()?.deleteFile(filename))
  ipcMain.handle("files:get-path", (_e, id: string) => getStorage()?.getFilePath(id))

  ipcMain.handle("storage-sync:activate", (_e) => getStorage()?.activateSync())
  ipcMain.handle("storage-sync:deactivate", (_e) => getStorage()?.deactivateSync())
  ipcMain.handle("storage-sync:sync", (_e) => getStorage()?.forceSync())
  ipcMain.handle("storage-sync:get-status", (_e) => getStorage()?.getSyncStatus())
}
