import {app} from "electron"

import {focusWindow} from "@main/utils/windows/focusWindow"

import type {TrayController} from "@main/modules/tray/TrayController"
import type {BrowserWindow} from "electron"

/**
 * Adds "Open Daily" above "Settings…", grouped with "Quick task". It brings Daily to the front
 * and focuses the main window, or opens a new one when the last was closed.
 * @param getMainWindow - the main window, if one is open
 * @param createMainWindow - opens a new main window
 */
export function setupTrayOpenDaily(
  tray: Pick<TrayController, "addItem">,
  getMainWindow: () => BrowserWindow | null,
  createMainWindow: () => BrowserWindow,
) {
  tray.addItem({id: "openDaily", section: "open", label: "Open Daily", click: openDaily}, "settings")

  function openDaily() {
    app.focus({steal: true})

    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow()
      return
    }

    focusWindow(mainWindow)
  }
}
