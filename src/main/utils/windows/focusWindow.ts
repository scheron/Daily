import type {BrowserWindow} from "electron"

export function focusWindow(win: BrowserWindow) {
  if (win.isMinimized()) win.restore()
  win.focus()
}
