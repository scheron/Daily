import type {IStorageController} from "@/types/storage"
import type {BrowserWindow} from "electron"

export function setupStorageSync(getStorage: () => IStorageController | null, getMainWindow: () => BrowserWindow | null) {
  const storage = getStorage()

  if (!storage) {
    console.error("Storage is not initialized")
    return
  }

  storage.setupStorageBroadcasts({
    onStatusChange: (status, prevStatus) => {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("storage-sync:status-changed", status, prevStatus)
      }
    },
    onDataChange: () => {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("storage-sync:data-changed")
      }
    },
  })
}
