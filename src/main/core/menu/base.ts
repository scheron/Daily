import {Menu} from "electron"

import type {BrowserWindow} from "electron"

import {createMacMenu} from "./darwin.js"
import {createWindowsMenu} from "./windows.js"

export function setupMenu(mainWindow: BrowserWindow): void {
  let template: Electron.MenuItemConstructorOptions[]

  if (process.platform === "darwin") {
    template = createMacMenu(mainWindow)
  } else {
    template = createWindowsMenu(mainWindow)
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
