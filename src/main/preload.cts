import {contextBridge, ipcRenderer} from "electron"

import type {PartialDeep} from "type-fest"
import type {Settings, StorageSyncEvent, Tag, Task} from "./types.js"

/* MAIN BRIDGE WITH FRONTEND */

//TODO: change all to [channel]:[method]
// prettier-ignore
contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),

  closeTimerWindow: () => ipcRenderer.send("window:close-timer"),
  openTimerWindow: (taskId: Task["id"]) => ipcRenderer.send("window:open-timer", taskId),
  onRefreshTimerWindow: (callback: (taskId: Task["id"]) => void) => ipcRenderer.on("timer:refresh-timer", (_event, taskId: Task["id"]) => callback(taskId)),

  platform: {
    isMac: () => process.platform === "darwin",
    isWindows: () => process.platform === "win32",
    isLinux: () => process.platform === "linux",
  },

  loadSettings: () => ipcRenderer.invoke("load-settings") as Promise<Settings>,
  saveSettings: (settings: Partial<Settings>) => ipcRenderer.invoke("save-settings", settings),

  getTaskList: () => ipcRenderer.invoke("get-task-list") as Promise<Task[]>,
  getTask: (id: Task["id"]) => ipcRenderer.invoke("get-task", id) as Promise<Task | null>,
  updateTask: (id: Task["id"], updates: PartialDeep<Task>) => ipcRenderer.invoke("update-task", id, updates),
  createTask: (task: Task) => ipcRenderer.invoke("create-task", task),
  deleteTask: (id: Task["id"]) => ipcRenderer.invoke("delete-task", id),

  onTaskSaved: (callback: (task: Task) => void) => ipcRenderer.on("task:saved", (_event, data: Task) => callback(data)),
  onTaskDeleted: (callback: (task: Task) => void) => ipcRenderer.on("task:deleted", (_event, data: Task) => callback(data)),

  getTagList: () => ipcRenderer.invoke("get-tag-list") as Promise<Tag[]>,
  getTag: (name: Tag["name"]) => ipcRenderer.invoke("get-tag", name) as Promise<Tag | null>,
  updateTag: (name: Tag["name"], tag: Tag) => ipcRenderer.invoke("update-tag", name, tag),
  createTag: (tag: Tag) => ipcRenderer.invoke("create-tag", tag),
  deleteTag: (name: Tag["name"]) => ipcRenderer.invoke("delete-tag", name),

  addTaskTags: (taskId: Task["id"], tagNames: Tag["name"][]) => ipcRenderer.invoke("add-task-tags", taskId, tagNames),
  removeTaskTags: (taskId: Task["id"], tagNames: Tag["name"][]) => ipcRenderer.invoke("remove-task-tags", taskId, tagNames),

  loadAllData: () => ipcRenderer.invoke("load-all-data") as Promise<{tasks: Task[]; tags: Tag[]}>,

  saveFile: (filename: string, data: Buffer) => ipcRenderer.invoke("save-file", filename, data),
  getFilePath: (id: string) => ipcRenderer.invoke("get-file-path", id),
  deleteFile: (filename: string) => ipcRenderer.invoke("delete-file", filename),


  onMenuAction: (callback: (action: "new-task" | "toggle-sidebar") => void) => {
    ipcRenderer.on("new-task", () => callback("new-task"))
    ipcRenderer.on("toggle-sidebar", () => callback("toggle-sidebar"))
  },

  syncStorage: () => ipcRenderer.invoke("sync-storage") as Promise<boolean>,

  onStorageSync: (callback: (event: StorageSyncEvent) => void) => ipcRenderer.on("storage:sync", (_event, data: StorageSyncEvent) => callback(data)),
  onStorageSyncStatus: (callback: (event: {isSyncing: boolean}) => void) => ipcRenderer.on("storage:is-syncing", (_event, data: {isSyncing: boolean}) => callback(data)),


  onDeepLink: (callback: (url: string) => void) => ipcRenderer.on("deep-link", (_, url) => callback(url)),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),

  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
})
