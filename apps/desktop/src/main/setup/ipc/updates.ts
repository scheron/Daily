import {join} from "node:path"
import {app, ipcMain} from "electron"

import {IS_DEMO} from "@main/demo/profile"
import {updaterController} from "@main/modules/updates/UpdaterController"
import {WhatsNewController} from "@main/modules/updates/WhatsNewController"
import {isMainWindowVisible} from "./windows"

import type {AppUpdateOffer} from "@shared/types/update"
import type {BrowserWindow, IpcMainInvokeEvent} from "electron"

export function setupUpdatesIPC(getMainWindow: () => BrowserWindow | null) {
  const whatsNew = IS_DEMO ? null : new WhatsNewController(app.getVersion(), join(app.getPath("userData"), "whats-new.json"))
  ipcMain.handle("updates:get-state", () => updaterController.getState())
  ipcMain.handle("updates:check", () => updaterController.checkForUpdate({manual: true}))
  ipcMain.handle("updates:download", (_event, offer: AppUpdateOffer) => updaterController.downloadUpdate(offer))
  ipcMain.handle("updates:install", () => updaterController.installDownloadedUpdate())

  ipcMain.handle("whats-new:get-release", (event) => (mainWindowFrom(event) ? (whatsNew?.getRelease() ?? null) : null))
  ipcMain.handle("whats-new:mark-shown", (event, version: string) => {
    const window = mainWindowFrom(event)
    return window && isMainWindowVisible(window) ? (whatsNew?.markShown(version) ?? false) : false
  })

  function mainWindowFrom(event: IpcMainInvokeEvent) {
    const window = getMainWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return null
    return window
  }
}
