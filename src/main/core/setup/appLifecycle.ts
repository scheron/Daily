import {app, nativeImage} from "electron"

import type {BrowserWindow} from "electron"
import type {StorageController} from "../storage/controller.js"

import {APP_CONFIG, ENV, PATHS} from "../../config.js"
import {notifyStorageSyncStatus, syncStorage} from "../storage/events.js"
import {focusWindow} from "../windows.js"

export function setupAppProtocol() {
  app.setAsDefaultProtocolClient(APP_CONFIG.protocol)
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

export function setupSingleInstanceLock(
  getStorage: () => StorageController,
  getMainWindow: () => BrowserWindow | null,
  handleDeepLink: (url: string, window: BrowserWindow) => void,
) {
  const gotLock = app.requestSingleInstanceLock()
  const DISABLE_FOCUS_SYNC = ENV.disableFocusSync

  if (!gotLock) {
    app.quit()
    return false
  }

  app.on("second-instance", async (_event, argv) => {
    const mainWindow = getMainWindow()
    const storage = getStorage()
    if (mainWindow && storage) {
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
    const url = argv.find((arg) => arg.startsWith(`${APP_CONFIG.protocol}://`))
    if (url && mainWindow) handleDeepLink(url, mainWindow)
  })

  return true
}

export function setupActivateHandler(
  getStorage: () => StorageController,
  getMainWindow: () => BrowserWindow | null,
  createMainWindow: () => BrowserWindow,
  setupWindowHandlers: (window: BrowserWindow) => void,
) {
  const DISABLE_FOCUS_SYNC = ENV.disableFocusSync

  app.on("activate", async () => {
    let mainWindow = getMainWindow()
    const storage = getStorage()

    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow()
      setupWindowHandlers(mainWindow)

      mainWindow.once("ready-to-show", () => {
        mainWindow!.show()
        focusWindow(mainWindow!)
      })
    } else if (mainWindow && storage) {
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

export function setupStorageSync(getStorage: () => StorageController, getMainWindow: () => BrowserWindow | null) {
  const mainWindow = getMainWindow()
  const storage = getStorage()

  if (mainWindow && storage) {
    mainWindow.on("focus", () => syncStorage(storage))
  }
}
