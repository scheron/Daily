import {ipcMain} from "electron"

import type {BrowserWindow} from "electron"

export function setupMainWindowIPC(mainWindow: BrowserWindow): void {
  ipcMain.on("window:minimize", () => mainWindow?.minimize())

  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })

  ipcMain.on("window:close", () => mainWindow?.close())
}
