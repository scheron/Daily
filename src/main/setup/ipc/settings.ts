import {ipcMain} from "electron"

import {createSettingsWindow} from "@/windows"

import type {BrowserWindow} from "electron"

export function setupSettingsIPC(getSettingsWindow: () => BrowserWindow | null, setSettingsWindow: (window: BrowserWindow | null) => void): void {
  ipcMain.on("settings:open", () => {
    const existing = getSettingsWindow()

    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return
    }

    const settingsWindow = createSettingsWindow()
    setSettingsWindow(settingsWindow)

    settingsWindow.on("closed", () => setSettingsWindow(null))
  })
}
