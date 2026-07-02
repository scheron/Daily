import {BrowserWindow} from "electron"

import {focusWindow} from "@/utils/windows/focusWindow"

import {APP_CONFIG, ENV, fsPaths} from "@/config"

export function createSettingsWindow(section?: string): BrowserWindow {
  const settingsWindow = new BrowserWindow({
    title: "Settings",
    width: APP_CONFIG.window.settings.width,
    height: APP_CONFIG.window.settings.height,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    frame: false,
    alwaysOnTop: false,
    transparent: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: fsPaths.icon(),
    webPreferences: {
      devTools: ENV.isDevelopment,
      preload: fsPaths.preload(),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })

  const query = section ? `?section=${section}` : ""
  const rendererPath = fsPaths.renderer()
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
