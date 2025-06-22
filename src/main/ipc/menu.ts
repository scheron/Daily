import {ipcMain} from "electron"

import type {BrowserWindow} from "electron"

export function setupMenuIPC(mainWindow: BrowserWindow): void {
  ipcMain.on("menu:new-task", () => mainWindow.webContents.send("new-task"))
  ipcMain.on("menu:toggle-sidebar", () => mainWindow.webContents.send("toggle-sidebar"))
}
