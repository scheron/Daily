import {ipcMain} from "electron"

import type {BrowserWindow} from "electron"

export function setupMenuIPC(mainWindow: BrowserWindow): void {
  ipcMain.on("menu:new-task", () => mainWindow.webContents.send("new-task"))
  ipcMain.on("menu:open-settings", () => mainWindow.webContents.send("open-settings"))
  ipcMain.on("menu:export-data", () => mainWindow.webContents.send("export-data"))
}
