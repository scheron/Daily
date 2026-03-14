import {ipcMain} from "electron"

import {createAssistantWindow} from "@/windows"

import type {BrowserWindow} from "electron"

export function setupAssistantIPC(getAssistantWindow: () => BrowserWindow | null, setAssistantWindow: (window: BrowserWindow | null) => void): void {
  ipcMain.on("assistant:open", () => {
    const existing = getAssistantWindow()

    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return
    }

    const assistantWindow = createAssistantWindow()
    setAssistantWindow(assistantWindow)

    assistantWindow.on("closed", () => setAssistantWindow(null))
  })
}
