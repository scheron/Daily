import {ipcMain} from "electron"

import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"

import type {ShortcutDefinition} from "@shared/types/shortcuts"
import type {BrowserWindow} from "electron"

export function setupMenuIPC(getMainWindow: () => BrowserWindow | null) {
  for (const action in SHORTCUTS_MAP) {
    const shortcut = SHORTCUTS_MAP[action] as ShortcutDefinition
    if (!("channel" in shortcut)) continue
    ipcMain.on(shortcut.channel, () => getMainWindow()?.webContents.send(shortcut.channel))
  }
}
