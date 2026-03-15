import type {IStorageController} from "@/types/storage"
import type {BrowserWindow} from "electron"

type WindowsGetter = () => Record<string, BrowserWindow | null>

function broadcastToAll(getWindows: WindowsGetter, channel: string, ...args: unknown[]) {
  const windows = getWindows()
  for (const win of Object.values(windows)) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}

export function setupStorageSync(getStorage: () => IStorageController | null, getWindows: WindowsGetter) {
  const storage = getStorage()

  if (!storage) {
    console.error("Storage is not initialized")
    return
  }

  storage.setupStorageBroadcasts({
    onStatusChange: (status, prevStatus) => {
      broadcastToAll(getWindows, "storage-sync:status-changed", status, prevStatus)
    },
    onDataChange: () => {
      broadcastToAll(getWindows, "storage-sync:data-changed")
    },
  })
}
