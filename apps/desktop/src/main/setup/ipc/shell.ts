import {BrowserWindow, clipboard, ipcMain, shell} from "electron"

import {logger, sniffImageExt} from "@daily/core"

export function setupShellIPC() {
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    try {
      const urlObj = new URL(url)
      const allowedProtocols = ["http:", "https:", "mailto:"]

      if (!allowedProtocols.includes(urlObj.protocol)) {
        logger.warn(logger.CONTEXT.SHELL, `Blocked attempt to open URL with disallowed protocol: ${url}`)
        return false
      }

      await shell.openExternal(url)
      return true
    } catch (err) {
      logger.error(logger.CONTEXT.SHELL, `Failed to open external URL: ${url}`, err)
      return false
    }
  })

  ipcMain.handle("clipboard:read-gif", ({sender, senderFrame}): Uint8Array<ArrayBuffer> | null => {
    if (process.platform !== "darwin" || senderFrame !== sender.mainFrame || !BrowserWindow.fromWebContents(sender)?.isFocused()) return null

    // Chromium can expose only the PNG representation of a GIF on the macOS pasteboard.
    const bytes = clipboard.readBuffer("com.compuserve.gif")
    return sniffImageExt(bytes) === "gif" ? new Uint8Array(bytes) : null
  })
}
