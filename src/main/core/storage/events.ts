import type {BrowserWindow} from "electron"
import type {IStorageController, StorageSyncEvent} from "../../types.js"

let getMainWindow: () => BrowserWindow | null = () => null

export function setupStorageEvents(getWindow: () => BrowserWindow | null) {
  getMainWindow = getWindow
}

export async function syncStorage(storage: IStorageController): Promise<void> {
  try {
    console.log("🔄 Storage sync triggered")
    notifyStorageSyncStatus(true)

    await storage.syncStorage()
  } catch (error) {
    console.error("❌ Storage sync error:", error)
  } finally {
    notifyStorageSyncStatus(false)
  }
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
  // console.log("notifyStorageSyncStatus", isSyncing)

  if (isSyncing) {
    win.webContents.send("storage:is-syncing", {isSyncing})
  } else {
    setTimeout(() => {
      win.webContents.send("storage:is-syncing", {isSyncing})
    }, 100)
  }
}
