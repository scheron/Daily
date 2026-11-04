import {ipcMain} from "electron"

import {updaterController} from "@main/modules/updates/UpdaterController"

import type {AppUpdateOffer} from "@shared/types/update"

export function setupUpdatesIPC() {
  ipcMain.handle("updates:get-state", () => updaterController.getState())
  ipcMain.handle("updates:check", () => updaterController.checkForUpdate({manual: true}))
  ipcMain.handle("updates:download", (_event, offer: AppUpdateOffer) => updaterController.downloadUpdate(offer))
  ipcMain.handle("updates:install", () => updaterController.installDownloadedUpdate())
}
