import {writeFile} from "node:fs/promises"
import {join} from "node:path"
import {app, BrowserWindow, dialog} from "electron"

import {logger} from "@daily/core"

import {IS_DEMO} from "./profile"

export async function captureDemoScreenshot(mainWindow: BrowserWindow): Promise<void> {
  if (!IS_DEMO || mainWindow.isDestroyed()) return

  try {
    const target = BrowserWindow.getFocusedWindow() ?? mainWindow
    const screenshot = await target.webContents.capturePage()
    if (screenshot.isEmpty()) {
      dialog.showErrorBox("Screenshot unavailable", "The Daily Demo window did not produce an image. Open the window and try again.")
      return
    }

    const result = await dialog.showSaveDialog(target, {
      title: "Save Daily Demo Screenshot",
      defaultPath: join(app.getPath("downloads"), "daily-demo.png"),
      filters: [{name: "PNG image", extensions: ["png"]}],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    })

    if (result.canceled || !result.filePath) return
    await writeFile(result.filePath, screenshot.toPNG())
  } catch (error) {
    logger.error(logger.CONTEXT.APP, "Demo screenshot export failed", error)
    dialog.showErrorBox("Could not save screenshot", error instanceof Error ? error.message : String(error))
  }
}
