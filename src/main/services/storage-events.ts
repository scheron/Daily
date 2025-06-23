import type {BrowserWindow} from "electron"
import type {StorageSyncEvent} from "../types.js"

let getMainWindow: () => BrowserWindow | null = () => null

export function setupStorageEvents(getWindow: () => BrowserWindow | null) {
  getMainWindow = getWindow
}

export function notifyStorageChange(type: StorageSyncEvent["type"]) {
  const win = getMainWindow()
  if (!win) return
  console.log("notifyStorageChange", type)

  win.webContents.send("storage:sync", {type})
}

export async function notifyStorageSyncStatus(isSyncing: boolean) {
  const win = getMainWindow()
  if (!win) return
  console.log("notifyStorageSyncStatus", isSyncing)

  if (isSyncing) {
    win.webContents.send("storage:is-syncing", {isSyncing})
  } else {
    setTimeout(() => {
      win.webContents.send("storage:is-syncing", {isSyncing})
    }, 100)
  }
}
