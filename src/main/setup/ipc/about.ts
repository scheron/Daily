import {ipcMain} from "electron"

import {createAboutWindow} from "@/windows"

import type {BrowserWindow} from "electron"

export function setupAboutIPC(getAboutWindow: () => BrowserWindow | null, setAboutWindow: (window: BrowserWindow | null) => void): void {
  ipcMain.on("about:open", () => {
    const existing = getAboutWindow()

    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return
    }

    const aboutWindow = createAboutWindow()
    setAboutWindow(aboutWindow)

    aboutWindow.on("closed", () => setAboutWindow(null))
  })
}
