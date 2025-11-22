import {ipcMain} from "electron"

import type {BrowserWindow} from "electron"

export function setupMainWindowIPC(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on("window:minimize", () => getMainWindow()?.minimize())
  ipcMain.on("window:maximize", () => {
    const mainWindow = getMainWindow()
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on("window:close", () => getMainWindow()?.close())
}
