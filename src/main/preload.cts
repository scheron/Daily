import {contextBridge, ipcRenderer} from "electron"

import type {DayItem, ExportTaskData, Settings, Tag, Task} from "./types.js"

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),

  platform: {
    isMac: () => process.platform === "darwin",
    isWindows: () => process.platform === "win32",
    isLinux: () => process.platform === "linux",
  },

  /* === ASSETS === */
  saveAsset: (filename: string, data: Buffer) => ipcRenderer.invoke("save-asset", filename, data),
  getAssetPath: (filename: string) => ipcRenderer.invoke("get-asset-path", filename),
  deleteAsset: (filename: string) => ipcRenderer.invoke("delete-asset", filename),

  /* === SETTINGS === */
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings: Partial<Settings>) => ipcRenderer.invoke("save-settings", settings),

  /* === DATA === */
  loadTasks: () => ipcRenderer.invoke("load-tasks") as Promise<Task[]>,
  saveTasks: (tasks: Task[]) => ipcRenderer.invoke("save-tasks", tasks),

  loadDays: () => ipcRenderer.invoke("load-days") as Promise<DayItem[]>,
  saveDays: (days: DayItem[]) => ipcRenderer.invoke("save-days", days),

  loadTags: () => ipcRenderer.invoke("load-tags") as Promise<Tag[]>,
  saveTags: (tags: Tag[]) => ipcRenderer.invoke("save-tags", tags),

  loadAllData: () => ipcRenderer.invoke("load-all-data") as Promise<{tasks: Task[]; days: DayItem[]}>,

  exportData: (exportData: ExportTaskData[]) => ipcRenderer.invoke("export-data", exportData) as Promise<boolean>,

  getStorageInfo: () => ipcRenderer.invoke("get-storage-info"),

  /* === MENU === */
  onMenuAction: (callback: (action: "new-task" | "open-settings" | "export-data") => void) => {
    ipcRenderer.on("new-task", () => callback("new-task"))
    ipcRenderer.on("open-settings", () => callback("open-settings"))
    ipcRenderer.on("export-data", () => callback("export-data"))
  },

  /* === UPDATES === */
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),

  onUpdateCheck: (callback: (hasUpdate: boolean, version: string | null) => void) => {
    ipcRenderer.on("update-check", (_, hasUpdate, version) => callback(hasUpdate, version))
  },
  onUpdateDownloaded: (callback: (version: string) => void) => {
    ipcRenderer.on("update-downloaded", (_, version) => callback(version))
  },
  onUpdateInstall: (callback: () => void) => {
    ipcRenderer.on("update-install", () => callback())
  },

  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
})
