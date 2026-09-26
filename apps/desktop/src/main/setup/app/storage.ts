import {logger} from "@daily/core"

import {broadcastToWindows} from "@main/utils/windows/broadcastToWindows"
import {sendToApprovalWindow} from "@main/utils/windows/sendToApprovalWindow"

import type {StorageController} from "@daily/core"
import type {WindowsGetter} from "@main/utils/windows/broadcastToWindows"

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
    onDataChange: (changeset) => {
      broadcastToWindows(getWindows, "storage:changed", changeset)
    },
    onSettingsChange: () => {
      broadcastToWindows(getWindows, "settings:changed")
    },
    onApprovalRequested: () => {
      sendToApprovalWindow(getWindows, "sync-server:approval-requested")
    },
    onRevoked: () => {
      broadcastToWindows(getWindows, "sync-server:revoked")
    },
    onProtocolMismatchChanged: (mismatch) => {
      broadcastToWindows(getWindows, "sync-server:protocol-mismatch-changed", mismatch)
    },
    onRoleChanged: (role) => {
      broadcastToWindows(getWindows, "sync-server:role-changed", role)
    },
    onAgentRequested: () => {
      sendToApprovalWindow(getWindows, "sync-server:agent-requested")
    },
    onAgentsAcceptedChanged: (acceptsAgents) => {
      broadcastToWindows(getWindows, "sync-server:agents-accepted-changed", acceptsAgents)
    },
    onReachabilityChanged: (isReachable) => {
      broadcastToWindows(getWindows, "sync-server:reachability-changed", isReachable)
    },
  })
}
