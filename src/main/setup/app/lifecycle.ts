import {APP_CONFIG, PATHS} from "@/config"
import {focusWindow} from "@/windows"
import {app, nativeImage} from "electron"

import type {StorageController} from "@/storage/StorageController"
import type {BrowserWindow} from "electron"

export function setupAppIdentity() {
  app.setName(APP_CONFIG.name)
}

export function setupDockIcon() {
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(PATHS.icon))
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
