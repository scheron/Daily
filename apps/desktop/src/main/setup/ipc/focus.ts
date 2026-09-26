import {ipcMain} from "electron"

import type {FocusController} from "@main/focus/FocusController"
import type {FocusCommand} from "@shared/types/focus"

export function setupFocusIPC(getFocus: () => FocusController | null) {
  ipcMain.handle("focus:get", () => getFocus()?.getSession())
  ipcMain.handle("focus:dispatch", (_e, command: FocusCommand) => getFocus()?.dispatch(command))
}
