import {ipcMain} from "electron"

import type {BrowserWindow} from "electron"

export function setupMainWindowIPC(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle("window:is-visible", (event) => {
    const window = getMainWindow()
    return Boolean(window && isMainWindowVisible(window) && window.webContents === event.sender)
  })
}

export function trackMainWindowVisibility(window: BrowserWindow) {
  const notify = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("window:visibility-changed", isMainWindowVisible(window))
    }
  }
  window.on("show", notify)
  window.on("hide", notify)
  window.on("minimize", notify)
  window.on("restore", notify)
}

export function isMainWindowVisible(window: BrowserWindow) {
  return !window.isDestroyed() && window.isVisible() && !window.isMinimized()
}
