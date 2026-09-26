import {ipcMain} from "electron"

import {broadcastToWindows} from "@main/utils/windows/broadcastToWindows"

import type {IStorageController} from "@daily/core"
import type {WindowsGetter} from "@main/utils/windows/broadcastToWindows"
import type {ApprovalKind} from "@shared/types/ipc"

// prettier-ignore
export function setupSyncServerIPC(getStorage: () => IStorageController | null, getWindows: WindowsGetter) {
  ipcMain.handle("sync-server:get-state", (_e) => getStorage()?.getServerProvider().getState())
  ipcMain.handle("sync-server:retry", (_e) => getStorage()?.getServerProvider().retry())
  ipcMain.handle("sync-server:default-device-name", (_e) => getStorage()?.getServerProvider().defaultDeviceName())
  ipcMain.handle("sync-server:probe", (_e, baseUrl: string) => getStorage()?.getServerProvider().probe(baseUrl))
  ipcMain.handle("sync-server:claim", (_e, code: string, deviceName: string, confirmInsecure: boolean) => getStorage()?.getServerProvider().claim(code, deviceName, confirmInsecure))
  ipcMain.handle("sync-server:request-enrollment", (_e, deviceName: string, confirmInsecure: boolean) => getStorage()?.getServerProvider().requestEnrollment(deviceName, confirmInsecure))
  ipcMain.handle("sync-server:poll-enrollment", (_e) => getStorage()?.getServerProvider().pollEnrollment())
  ipcMain.handle("sync-server:cancel-connection", (_e) => getStorage()?.getServerProvider().cancelConnection())
  ipcMain.handle("sync-server:disconnect", (_e) => getStorage()?.getServerProvider().disconnect())

  ipcMain.handle("sync-server:get-pending-approval", (_e) => getStorage()?.getServerProvider().pendingApproval())
  ipcMain.handle("sync-server:approve", async (_e, requestId: string, code: string) => {
    await getStorage()?.getServerProvider().approve(requestId, code)
    announceResolved(getWindows, "device")
  })
  ipcMain.handle("sync-server:deny", async (_e, requestId: string) => {
    await getStorage()?.getServerProvider().deny(requestId)
    announceResolved(getWindows, "device")
  })

  ipcMain.handle("sync-server:list-membership", (_e) => getStorage()?.getServerProvider().listMembership())
  ipcMain.handle("sync-server:revoke-device", (_e, deviceId: string) => getStorage()?.getServerProvider().revokeDevice(deviceId))
  ipcMain.handle("sync-server:open-enrollment-window", (_e) => getStorage()?.getServerProvider().openEnrollmentWindow())
  ipcMain.handle("sync-server:close-enrollment-window", (_e) => getStorage()?.getServerProvider().closeEnrollmentWindow())

  ipcMain.handle("sync-server:open-agent-window", (_e) => getStorage()?.getServerProvider().openAgentWindow())
  ipcMain.handle("sync-server:close-agent-window", (_e) => getStorage()?.getServerProvider().closeAgentWindow())
  ipcMain.handle("sync-server:get-pending-agent-request", (_e) => getStorage()?.getServerProvider().pendingAgentRequest())
  ipcMain.handle("sync-server:approve-agent", async (_e, requestId: string, code: string) => {
    await getStorage()?.getServerProvider().approveAgent(requestId, code)
    announceResolved(getWindows, "agent")
  })
  ipcMain.handle("sync-server:deny-agent", async (_e, requestId: string) => {
    await getStorage()?.getServerProvider().denyAgent(requestId)
    announceResolved(getWindows, "agent")
  })
  ipcMain.handle("sync-server:list-agents", (_e) => getStorage()?.getServerProvider().listAgents())
  ipcMain.handle("sync-server:revoke-agent", (_e, agentId: string) => getStorage()?.getServerProvider().revokeAgent(agentId))
}

function announceResolved(getWindows: WindowsGetter, kind: ApprovalKind) {
  broadcastToWindows(getWindows, "sync-server:approval-resolved", kind)
}
