import {BrowserWindow} from "electron"

import {ENV} from "@shared/config/env"
import {WINDOWS_CONFIG} from "@shared/config/windows"
import {focusWindow} from "@/utils/windows/focusWindow"

import {electronPaths} from "@/runtime/electronPaths"

export function createSettingsWindow(section?: string): BrowserWindow {
  const settingsWindow = new BrowserWindow({
    title: "Settings",
    width: WINDOWS_CONFIG.settings.width,
    height: WINDOWS_CONFIG.settings.height,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    frame: false,
    alwaysOnTop: false,
    transparent: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: electronPaths.icon(),
    webPreferences: {
      devTools: ENV.isDevelopment,
      preload: electronPaths.preload(),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })

  const query = section ? `?section=${section}` : ""
  const rendererPath = electronPaths.renderer()
  if (rendererPath.startsWith("http")) {
    settingsWindow.loadURL(`${rendererPath}#/settings${query}`)
  } else {
    settingsWindow.loadFile(rendererPath, {hash: `/settings${query}`})
  }

  settingsWindow.webContents.once("ipc-message", (_event, channel) => {
    if (channel === "window:ready") {
      settingsWindow.show()
      focusWindow(settingsWindow)
    }
  })

  return settingsWindow
}
