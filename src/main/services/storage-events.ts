import type {BrowserWindow} from "electron"
import type {StorageSyncEvent} from "../types.js"

let getMainWindow: () => BrowserWindow | null = () => null

export function setupStorageSync(getWindow: () => BrowserWindow | null) {
  getMainWindow = getWindow
}

export function notifyStorageChange(type: StorageSyncEvent["type"]) {
  const win = getMainWindow()
  if (!win) return

  win.webContents.send("storage:sync", {type})
}
