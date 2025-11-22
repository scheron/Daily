import {ipcMain} from "electron"

import type {BrowserWindow} from "electron"

export function setupMenuIPC(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on("menu:new-task", () => getMainWindow()?.webContents.send("new-task"))
  ipcMain.on("menu:toggle-sidebar", () => getMainWindow()?.webContents.send("toggle-sidebar"))
  ipcMain.on("menu:devtools", () => ipcMain.emit("devtools:open"))
}
