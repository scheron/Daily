import {createTimerWindow} from "@/windows"
import {BrowserWindow, ipcMain} from "electron"

import type {Task} from "@shared/types/storage"

export function setupTimerIPC(
  getMainWindow: () => BrowserWindow | null,
  getTimerWindow: () => BrowserWindow | null,
  setTimerWindow: (window: BrowserWindow | null) => void,
) {
  ipcMain.on("window:open-timer", (_e, taskId: Task["id"]) => {
    const existingTimer = getTimerWindow()

    if (existingTimer && !existingTimer.isDestroyed()) {
      existingTimer.webContents.send("timer:refresh-timer", taskId)
      existingTimer.show()
      existingTimer.focus()
      return
    }

    const newTimerWindow = createTimerWindow(taskId)
    setTimerWindow(newTimerWindow)

    newTimerWindow.on("closed", () => setTimerWindow(null))
    newTimerWindow.once("ready-to-show", () => newTimerWindow.show())
  })

  ipcMain.on("window:close-timer", (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (senderWindow && senderWindow !== getMainWindow?.()) {
      senderWindow.close()

      if (senderWindow === getTimerWindow()) {
        setTimerWindow(null)
      }
    }
  })
}
