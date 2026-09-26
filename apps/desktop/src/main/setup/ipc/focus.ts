import {ipcMain} from "electron"

import {focusWindow} from "@main/utils/windows/focusWindow"

import type {FocusController} from "@main/focus/FocusController"
import type {FocusCommand} from "@shared/types/focus"
import type {BrowserWindow} from "electron"

export function setupFocusIPC(getFocus: () => FocusController | null, getFocusWindow: () => BrowserWindow | null) {
  ipcMain.handle("focus:get", () => getFocus()?.getSession())
  ipcMain.handle("focus:dispatch", (_e, command: FocusCommand) => getFocus()?.dispatch(command))
  ipcMain.on("focus:show-window", () => {
    const detachedWindow = getFocusWindow()
    if (detachedWindow) focusWindow(detachedWindow)
  })
}
