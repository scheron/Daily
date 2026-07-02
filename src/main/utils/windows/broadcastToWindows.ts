import type {BrowserWindow} from "electron"

export type WindowsGetter = () => Record<string, BrowserWindow | null>

export function broadcastToWindows(getWindows: WindowsGetter, channel: string, ...args: unknown[]) {
  const windows = getWindows()

  for (const win of Object.values(windows)) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}
