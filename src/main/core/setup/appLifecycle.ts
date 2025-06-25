import {app, BrowserWindow, nativeImage} from "electron"

import type {StorageController} from "../storage/controller.js"

import {PATHS} from "../../config.js"
import {focusWindow} from "../windows.js"
import {notifyStorageSyncStatus, syncStorage} from "../storage/events.js"

export function setupAppProtocol() {
  app.setAsDefaultProtocolClient("daily")
  app.setName("Daily")
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

export function setupSingleInstanceLock(
  storage: StorageController,
  getMainWindow: () => BrowserWindow | null,
  handleDeepLink: (url: string, window: BrowserWindow) => void,
) {
  const gotLock = app.requestSingleInstanceLock()
  const DISABLE_FOCUS_SYNC = process.env.DISABLE_FOCUS_SYNC === "true"

  if (!gotLock) {
    app.quit()
    return false
  }

  app.on("second-instance", async (_event, argv) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      focusWindow(mainWindow)
      if (!DISABLE_FOCUS_SYNC) {
        try {
          notifyStorageSyncStatus(true)
          await storage.syncStorage()
          console.log("🔄 Storage revalidated on second-instance")
        } catch (err) {
          console.warn("⚠️ Failed to revalidate storage on second-instance:", err)
        } finally {
          notifyStorageSyncStatus(false)
        }
      }
    }
    const url = argv.find((arg) => arg.startsWith("daily://"))
    if (url && mainWindow) handleDeepLink(url, mainWindow)
  })

  return true
}

export function setupActivateHandler(
  storage: StorageController,
  getMainWindow: () => BrowserWindow | null,
  createMainWindow: () => BrowserWindow,
  setupWindowHandlers: (window: BrowserWindow) => void,
) {
  const DISABLE_FOCUS_SYNC = process.env.DISABLE_FOCUS_SYNC === "true"

  app.on("activate", async () => {
    let mainWindow = getMainWindow()

    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
      setupWindowHandlers(mainWindow)

      mainWindow.once("ready-to-show", () => {
        mainWindow!.show()
        focusWindow(mainWindow!)
      })
    } else if (mainWindow) {
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

export function setupWindowAllClosedHandler() {
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })
}

export function setupStorageSync(storage: StorageController, getMainWindow: () => BrowserWindow | null) {
  const mainWindow = getMainWindow()

  if (mainWindow) {
    mainWindow.on("focus", () => syncStorage(storage))
  }
}
