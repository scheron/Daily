import {contextBridge, ipcRenderer} from "electron"

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

  getSettings: () => ipcRenderer.invoke("get-settings") as Promise<Settings>,
  saveSettings: (settings: Partial<Settings>) => ipcRenderer.invoke("save-settings", settings),

  loadTasks: () => ipcRenderer.invoke("load-tasks") as Promise<Task[]>,
  saveTasks: (tasks: Task[]) => ipcRenderer.invoke("save-tasks", tasks),
  deleteTask: (id: Task["id"]) => ipcRenderer.invoke("delete-task", id),

  onTaskSaved: (callback: (task: Task) => void) => ipcRenderer.on("task:saved", (_event, data: Task) => callback(data)),
  onTaskDeleted: (callback: (task: Task) => void) => ipcRenderer.on("task:deleted", (_event, data: Task) => callback(data)),

  loadTags: () => ipcRenderer.invoke("load-tags") as Promise<Tag[]>,
  saveTags: (tags: Tag[]) => ipcRenderer.invoke("save-tags", tags),

  loadAllData: () => ipcRenderer.invoke("load-all-data") as Promise<{tasks: Task[]; tags: Tag[]}>,

  saveAsset: (filename: string, data: Buffer) => ipcRenderer.invoke("save-asset", filename, data),
  getAssetPath: (filename: string) => ipcRenderer.invoke("get-asset-path", filename),
  deleteAsset: (filename: string) => ipcRenderer.invoke("delete-asset", filename),

  onMenuAction: (callback: (action: "new-task" | "toggle-sidebar") => void) => {
    ipcRenderer.on("new-task", () => callback("new-task"))
    ipcRenderer.on("toggle-sidebar", () => callback("toggle-sidebar"))
  },

  getStoragePath: (pretty?: boolean) => ipcRenderer.invoke("get-storage-path", pretty),
  selectStoragePath: (removeOld?: boolean) => ipcRenderer.invoke("select-storage-path", removeOld),

  syncStorage: () => ipcRenderer.invoke("sync-storage") as Promise<boolean>,

  onStorageSync: (callback: (event: StorageSyncEvent) => void) => ipcRenderer.on("storage:sync", (_event, data: StorageSyncEvent) => callback(data)),
  onStorageSyncStatus: (callback: (event: {isSyncing: boolean}) => void) => ipcRenderer.on("storage:is-syncing", (_event, data: {isSyncing: boolean}) => callback(data)),


  onDeepLink: (callback: (url: string) => void) => ipcRenderer.on("deep-link", (_, url) => callback(url)),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),

  // Console logging to main process
  // TODO: Remove this
  consoleElectron: (...args: any[]) => ipcRenderer.send("console:electron", ...args),
})
