import {APP_CONFIG} from "@/config"
import {focusWindow} from "@/windows"
import {app} from "electron"

import type {StorageController} from "@/storage/StorageController"
import type {BrowserWindow} from "electron"

import {handleDeepLink} from "./deeplinks"

export function setupInstanceAndDeepLinks(getStorage: () => StorageController | null, getMainWindow: () => BrowserWindow | null) {
  const gotLock = app.requestSingleInstanceLock()

  if (!gotLock) {
    app.quit()
    return false
  }

  app.setAsDefaultProtocolClient(APP_CONFIG.protocol)

  app.on("second-instance", async (_event, argv) => {
    const mainWindow = getMainWindow()

    if (mainWindow) {
      focusWindow(mainWindow)
    }

    const url = argv.find((arg) => arg.startsWith(`${APP_CONFIG.protocol}://`))
    if (url && mainWindow) handleDeepLink(url, mainWindow)
  })

  app.on("open-url", (event, url) => {
    event.preventDefault()
    const mainWindow = getMainWindow()
    if (url && mainWindow) handleDeepLink(url, mainWindow)
  })

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
