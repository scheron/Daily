import {ipcMain} from "electron"

import {ShortcutsMap} from "@shared/constants/shortcuts"

import type {ShortcutDefinition} from "@shared/types/shortcuts"
import type {BrowserWindow} from "electron"

export function setupMenuIPC(getMainWindow: () => BrowserWindow | null): void {
  for (const action in ShortcutsMap) {
    const shortcut = ShortcutsMap[action] as ShortcutDefinition
    ipcMain.on(shortcut.channel, () => getMainWindow()?.webContents.send(shortcut.channel))
  }

  ipcMain.on("menu:devtools", () => ipcMain.emit("devtools:open"))
}
