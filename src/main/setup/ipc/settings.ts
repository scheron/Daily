import {ipcMain} from "electron"

import {createSettingsWindow} from "@/windows"

import type {BrowserWindow} from "electron"

export function setupSettingsIPC(getSettingsWindow: () => BrowserWindow | null, setSettingsWindow: (window: BrowserWindow | null) => void): void {
  ipcMain.on("settings:open", (_event, section?: string) => {
    const existing = getSettingsWindow()

    if (existing && !existing.isDestroyed()) {
      if (section) {
        existing.webContents.send("settings:navigate", section)
      }
      existing.show()
      existing.focus()
      return
    }

    const settingsWindow = createSettingsWindow(section)
    setSettingsWindow(settingsWindow)

    settingsWindow.on("closed", () => setSettingsWindow(null))
  })
}
