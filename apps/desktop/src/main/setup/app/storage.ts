import {logger} from "@daily/core"

import {broadcastToWindows} from "@main/utils/windows/broadcastToWindows"
import {sendToApprovalWindow} from "@main/utils/windows/sendToApprovalWindow"

import type {StorageController} from "@daily/core"
import type {FocusController} from "@main/modules/focus/FocusController"
import type {WindowsGetter} from "@main/utils/windows/broadcastToWindows"

export function setupStorageSync(
  getStorage: () => StorageController | null,
  getWindows: WindowsGetter,
  getFocus: () => FocusController | null,
  onBroadcast: (channel: string, ...args: unknown[]) => void = () => undefined,
) {
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
      onBroadcast("storage:changed", changeset)
      getFocus()?.applyStorageChange(changeset)
    },
    onSettingsChange: () => {
      broadcastToWindows(getWindows, "settings:changed")
      onBroadcast("settings:changed")
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
    onConnectionChanged: (connection) => {
      broadcastToWindows(getWindows, "sync-server:connection-changed", connection)
    },
  })
}
