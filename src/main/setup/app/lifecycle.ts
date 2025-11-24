import {app, nativeImage} from "electron"

import type {BrowserWindow} from "electron"
import type {StorageController} from "../../storage/StorageController.js"

import {APP_CONFIG, ENV, PATHS} from "../../config.js"
import {focusWindow} from "../../windows.js"
import {notifyStorageSyncStatus, syncStorage} from "./storage.js"

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
  const DISABLE_FOCUS_SYNC = ENV.disableFocusSync

  app.on("activate", async () => {
    let mainWindow = getMainWindow()
    const storage = getStorage()

    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow()
      return
    }

    if (storage) {
      focusWindow(mainWindow)

      if (!DISABLE_FOCUS_SYNC) {
        try {
          notifyStorageSyncStatus(true)
          await storage.syncStorage()
          console.log("🔄 Storage revalidated on activate")
        } catch (err) {
          console.warn("⚠️ Failed to revalidate storage on activate:", err)
        } finally {
          notifyStorageSyncStatus(false)
        }
      }
    }
  })
}

export function setupStorageSync(getStorage: () => StorageController, getMainWindow: () => BrowserWindow | null) {
  const DISABLE_FOCUS_SYNC = ENV.disableFocusSync

  if (DISABLE_FOCUS_SYNC) return

  app.on("browser-window-focus", (_event, window) => {
    const mainWindow = getMainWindow()
    const storage = getStorage()

    if (window === mainWindow && storage) {
      syncStorage(storage)
    }
  })
}
