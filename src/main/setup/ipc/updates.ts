import {ipcMain} from "electron"

import {checkForUpdate, getUpdateState, installDownloadedUpdate} from "@/setup/updates/updater"

export function setupUpdatesIPC(): void {
  ipcMain.handle("updates:get-state", () => getUpdateState())
  ipcMain.handle("updates:check", () => checkForUpdate({manual: true}))
  ipcMain.handle("updates:install", () => installDownloadedUpdate())
}
