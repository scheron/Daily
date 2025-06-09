import { Menu, type BrowserWindow } from "electron"
import { createMacMenu } from "./mac-menu.js"
import { createWindowsMenu } from "./windows-menu.js"

export function createMenu(mainWindow: BrowserWindow): void {
  let template: Electron.MenuItemConstructorOptions[]

  if (process.platform === "darwin") {
    template = createMacMenu(mainWindow)
  } else {
    template = createWindowsMenu(mainWindow)
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
} 