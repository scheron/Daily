import {BrowserWindow, shell} from "electron"

import {APP_CONFIG, fsPaths} from "@/config"
import {resolveMainWindowOptions} from "@/setup/app/windowBounds"

import type {MainWindowSettings} from "@shared/types/storage"

export function createMainWindow(savedState?: MainWindowSettings): BrowserWindow {
  const restoredOptions = resolveMainWindowOptions(savedState)

  const mainWindow = new BrowserWindow({
    title: APP_CONFIG.name,
    width: restoredOptions.width,
    minWidth: APP_CONFIG.window.main.minWidth,
    height: restoredOptions.height,
    minHeight: APP_CONFIG.window.main.minHeight,
    trafficLightPosition: {y: 14, x: 14},
    center: true,
    transparent: true,
    frame: false,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: fsPaths.icon(),
    webPreferences: {
      preload: fsPaths.preload(),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })

  if (savedState?.isFullScreen) {
    mainWindow.once("ready-to-show", () => mainWindow.setFullScreen(true))
  } else if (savedState?.isMaximized) {
    mainWindow.maximize()
  }

  const rendererPath = fsPaths.renderer()

  if (rendererPath.startsWith("http")) mainWindow.loadURL(rendererPath)
  else mainWindow.loadFile(rendererPath)

  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    shell.openExternal(url)
    return {action: "deny"}
  })

  return mainWindow
}
