import {logger} from "@/utils/logger"
import {broadcastToWindows} from "@/utils/windows/broadcastToWindows"

import type {StorageController} from "@/storage/StorageController"
import type {WindowsGetter} from "@/utils/windows/broadcastToWindows"

export function setupStorageSync(getStorage: () => StorageController | null, getWindows: WindowsGetter) {
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
    onApprovalRequested: () => {
      broadcastToWindows(getWindows, "sync-server:approval-requested")
    },
  })
}
