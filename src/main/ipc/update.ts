import {ipcMain} from "electron"

import type {BrowserWindow} from "electron"

import {updateService} from "../services/update.js"

export async function setupUpdateIPC(mainWindow: BrowserWindow) {
  ipcMain.handle("check-for-updates", async () => await updateService.checkForUpdates())
  ipcMain.handle("download-update", async () => await updateService.downloadUpdate())
  ipcMain.handle("install-update", async () => await updateService.installUpdate())

  const {hasUpdate, version} = await updateService.checkForUpdates()

  if (!hasUpdate) {
    console.log("Current version is the latest")
    return
  }

  updateService
    .downloadUpdate()
    .then((success) => {
      if (!success) {
        console.log("Failed to download update")
        return
      }

      mainWindow?.webContents.send("update-downloaded", version)
    })
    .catch((error) => {
      console.error("❌ Failed to download update:", error)
    })
}
