import {app} from "electron"

import type {BrowserWindow} from "electron"
import type {StorageController} from "../../storage/StorageController.js"

import {APP_CONFIG, ENV} from "../../config.js"
import {focusWindow} from "../../windows.js"
import {handleDeepLink} from "./deeplinks.js"
import {notifyStorageSyncStatus} from "./storage.js"

export function setupInstanceAndDeepLinks(getStorage: () => StorageController | null, getMainWindow: () => BrowserWindow | null) {
  const gotLock = app.requestSingleInstanceLock()
  const DISABLE_FOCUS_SYNC = ENV.disableFocusSync

  if (!gotLock) {
    app.quit()
    return false
  }

  app.setAsDefaultProtocolClient(APP_CONFIG.protocol)

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

  // macOS open-url
  app.on("open-url", (event, url) => {
    event.preventDefault()
    const mainWindow = getMainWindow()
    if (url && mainWindow) handleDeepLink(url, mainWindow)
  })

  // startup argv (Windows/Linux)
  const urlArg = process.argv.find((arg) => arg.startsWith(`${APP_CONFIG.protocol}://`))
  if (urlArg) {
    app.whenReady().then(() => {
      const mainWindow = getMainWindow()
      if (!mainWindow) return
      setTimeout(() => handleDeepLink(urlArg, mainWindow), 1000)
    })
  }

  return true
}
