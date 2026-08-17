import {ipcMain} from "electron"

import type {IStorageController} from "@/types/storage"

// prettier-ignore
export function setupSyncServerIPC(getStorage: () => IStorageController | null) {
  ipcMain.handle("sync-server:get-binding", (_e) => getStorage()?.getServerProvider().getBinding())
  ipcMain.handle("sync-server:default-device-name", (_e) => getStorage()?.getServerProvider().defaultDeviceName())
  ipcMain.handle("sync-server:probe", (_e, baseUrl: string) => getStorage()?.getServerProvider().probe(baseUrl))
  ipcMain.handle("sync-server:claim", (_e, code: string, deviceName: string, confirmInsecure: boolean) => getStorage()?.getServerProvider().claim(code, deviceName, confirmInsecure))
  ipcMain.handle("sync-server:request-enrollment", (_e, deviceName: string, confirmInsecure: boolean) => getStorage()?.getServerProvider().requestEnrollment(deviceName, confirmInsecure))
  ipcMain.handle("sync-server:poll-enrollment", (_e) => getStorage()?.getServerProvider().pollEnrollment())
  ipcMain.handle("sync-server:cancel-connection", (_e) => getStorage()?.getServerProvider().cancelConnection())
  ipcMain.handle("sync-server:disconnect", (_e) => getStorage()?.getServerProvider().disconnect())

  ipcMain.handle("sync-server:get-pending-approval", (_e) => getStorage()?.getServerProvider().pendingApproval())
  ipcMain.handle("sync-server:approve", (_e, requestId: string, code: string) => getStorage()?.getServerProvider().approve(requestId, code))
  ipcMain.handle("sync-server:deny", (_e, requestId: string) => getStorage()?.getServerProvider().deny(requestId))
}
