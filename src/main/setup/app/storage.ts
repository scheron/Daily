import {logger} from "@/utils/logger"
import {broadcastToWindows} from "@/utils/windows/broadcastToWindows"

import type {IStorageController} from "@/types/storage"
import type {WindowsGetter} from "@/utils/windows/broadcastToWindows"

export function setupStorageSync(getStorage: () => IStorageController | null, getWindows: WindowsGetter) {
  const storage = getStorage()

  if (!storage) {
    logger.error("STORAGE", "Storage is not initialized")
    return
  }

  storage.setupStorageBroadcasts({
    onStatusChange: (status, prevStatus) => {
      broadcastToWindows(getWindows, "storage-sync:status-changed", status, prevStatus)
    },
    onDataChange: () => {
      broadcastToWindows(getWindows, "storage-sync:data-changed")
    },
    onSettingsChange: () => {
      broadcastToWindows(getWindows, "settings:changed")
    },
  })
}
