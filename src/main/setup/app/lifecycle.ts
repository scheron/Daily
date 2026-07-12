import {join} from "node:path"
import {app, nativeImage} from "electron"

import {APP_CONFIG} from "@shared/config/app"
import {ENV} from "@shared/config/env"
import {logger} from "@/utils/logger"
import {focusWindow} from "@/utils/windows/focusWindow"

import {electronPaths} from "@/runtime/electronPaths"

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
      app.dock.setIcon(nativeImage.createFromPath(electronPaths.icon()))
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
