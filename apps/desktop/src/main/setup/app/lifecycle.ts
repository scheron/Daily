import {join} from "node:path"
import {app, nativeImage} from "electron"

import {ENV, logger} from "@daily/core"

import {electronPaths} from "@main/config/electronPaths"
import {IS_DEMO, resolveAppProfile} from "@main/demo/profile"
import {focusWindow} from "@main/utils/windows/focusWindow"

import type {StorageController} from "@daily/core"
import type {BrowserWindow} from "electron"

export function setupAppBoot() {
  const profile = resolveAppProfile(IS_DEMO, ENV.isDevelopment)
  app.setName(profile.name)

  if (IS_DEMO || ENV.isDevelopment) {
    const userData = join(app.getPath("appData"), profile.dataDirectory)
    app.setPath("userData", userData)
    app.setPath("sessionData", join(userData, "Session"))
    logger.info(logger.CONTEXT.STORAGE, `${profile.name} — isolated userData at ${userData}`)
  }
}

export function setupDockIcon() {
  // A runtime override bypasses macOS's bundle icon and its appearance variants.
  if (!app.isPackaged && process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(electronPaths.icon()))
    } catch (error) {
      console.warn("Failed to set dock icon:", error)
    }
  }
}

export function setupWindowAllClosedHandler() {
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })
}

export function setupActivateHandler(
  getStorage: () => StorageController | null,
  getMainWindow: () => BrowserWindow | null,
  createMainWindow: () => BrowserWindow,
) {
  app.on("activate", async () => {
    let mainWindow = getMainWindow()
    const storage = getStorage()

    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow()
      return
    }

    if (storage) {
      focusWindow(mainWindow)
    }
  })
}
