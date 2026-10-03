import {ipcMain} from "electron"

import type {BrowserWindow, IpcMainEvent} from "electron"

/**
 * Resolves once the main window's own renderer sends `app:renderer-ready`. A signal from any
 * other window (Settings, Assistant) is ignored, so a light window opened during startup never
 * closes the main window's splash early.
 */
export function waitForRendererReady(getMainWindow: () => BrowserWindow | null): Promise<void> {
  return new Promise((resolve) => {
    const handleReady = (event: IpcMainEvent) => {
      const mainWindow = getMainWindow()
      if (!mainWindow || event.sender !== mainWindow.webContents) return

      ipcMain.off("app:renderer-ready", handleReady)
      resolve()
    }

    ipcMain.on("app:renderer-ready", handleReady)
  })
}
