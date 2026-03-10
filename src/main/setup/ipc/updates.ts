import {ipcMain} from "electron"

import {updaterController} from "@/updates/UpdaterController"

export function setupUpdatesIPC(): void {
  ipcMain.handle("updates:get-state", () => updaterController.getState())
  ipcMain.handle("updates:check", () => updaterController.checkForUpdate({manual: true}))
  ipcMain.handle("updates:download", () => updaterController.downloadUpdate())
  ipcMain.handle("updates:install", () => updaterController.installDownloadedUpdate())
}
