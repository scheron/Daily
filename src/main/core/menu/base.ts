import {Menu} from "electron"

import type {BrowserWindow} from "electron"

import {createMacMenu} from "./darwin.js"
import {createWindowsMenu} from "./windows.js"

export function setupMenu(getMainWindow: () => BrowserWindow | null): void {
  let template: Electron.MenuItemConstructorOptions[]

  const mainWindow = getMainWindow()
  if (!mainWindow) return

  if (process.platform === "darwin") {
    template = createMacMenu(mainWindow)
  } else {
    template = createWindowsMenu(mainWindow)
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
