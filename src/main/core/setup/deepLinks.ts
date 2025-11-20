import {app} from "electron"

import type {BrowserWindow} from "electron"

export function setupDeepLinks(getMainWindow: () => BrowserWindow | null): void {
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    app.quit()
  } else {
    app.on("second-instance", (event, commandLine, _workingDirectory) => {
      const mainWindow = getMainWindow()
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }

      const url = commandLine.find((arg) => arg.startsWith("daily://"))
      if (url && mainWindow) handleDeepLink(url, mainWindow)
    })

    app.setAsDefaultProtocolClient("daily")

    app.on("open-url", (event, url) => {
      event.preventDefault()
      const mainWindow = getMainWindow()
      if (url && mainWindow) handleDeepLink(url, mainWindow)
    })
  }

  const argv = process.argv
  const url = argv.find((arg) => arg.startsWith("daily://"))
  if (url) {
    app.whenReady().then(() => {
      const mainWindow = getMainWindow()
      if (!mainWindow) return
      setTimeout(() => handleDeepLink(url, mainWindow), 1000)
    })
  }
}

export function handleDeepLink(url: string, mainWindow: BrowserWindow): void {
  console.log("Deep link received:", url)

  if (mainWindow) {
    mainWindow.webContents.send("deep-link", url)
  }
}
