import {ipcMain, shell} from "electron"

import {LogContext, logger} from "@/utils/logger"

/**
 * Setup IPC handlers for shell operations
 * Currently handles opening external URLs in the system browser
 */
export function setupShellIPC(): void {
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    try {
      // Validate URL before opening
      const urlObj = new URL(url)
      const allowedProtocols = ["http:", "https:", "mailto:"]

      if (!allowedProtocols.includes(urlObj.protocol)) {
        logger.warn(LogContext.SHELL, `Blocked attempt to open URL with disallowed protocol: ${url}`)
        return false
      }

      await shell.openExternal(url)
      return true
    } catch (err) {
      logger.error(LogContext.SHELL, `Failed to open external URL: ${url}`, err)
      return false
    }
  })
}
