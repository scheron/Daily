import {join} from "node:path"
import {app, nativeImage} from "electron"

import {logger} from "@/utils/logger"
import {focusWindow} from "@/utils/windows/focusWindow"

import {APP_CONFIG, ENV, fsPaths} from "@/config"

import type {StorageController} from "@/storage/StorageController"
import type {BrowserWindow} from "electron"

export function setupAppBoot() {
  app.setName(APP_CONFIG.name)

  if (ENV.isDevelopment) {
    const devUserData = join(app.getPath("appData"), `${APP_CONFIG.name}-dev`)
    app.setPath("userData", devUserData)
    logger.info(logger.CONTEXT.STORAGE, `Development build — isolated userData at ${devUserData}`)
  }
}

export function setupDockIcon() {
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(fsPaths.icon()))
    } catch (error) {
      console.warn("Failed to set dock icon:", error)
    }
  }
}

export function setupWindowAllClosedHandler() {
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })
}

export function setupActivateHandler(
  getStorage: () => StorageController | null,
  getMainWindow: () => BrowserWindow | null,
  createMainWindow: () => BrowserWindow,
) {
  app.on("activate", async () => {
    let mainWindow = getMainWindow()
    const storage = getStorage()

    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow()
      return
    }

    if (storage) {
      focusWindow(mainWindow)
    }
  })
}
