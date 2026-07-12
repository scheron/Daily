import {BrowserWindow} from "electron"

import {ENV} from "@shared/config/env"
import {WINDOWS_CONFIG} from "@shared/config/windows"
import {focusWindow} from "@/utils/windows/focusWindow"

import {electronPaths} from "@/runtime/electronPaths"

export function createAssistantWindow(): BrowserWindow {
  const assistantWindow = new BrowserWindow({
    title: "AI Assistant",
    width: WINDOWS_CONFIG.assistant.width,
    height: WINDOWS_CONFIG.assistant.height,
    minWidth: 380,
    minHeight: 500,
    resizable: true,
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

  const rendererPath = electronPaths.renderer()
  if (rendererPath.startsWith("http")) {
    assistantWindow.loadURL(`${rendererPath}#/assistant`)
  } else {
    assistantWindow.loadFile(rendererPath, {hash: "/assistant"})
  }

  assistantWindow.webContents.once("ipc-message", (_event, channel) => {
    if (channel === "window:ready") {
      assistantWindow.show()
      focusWindow(assistantWindow)
    }
  })

  return assistantWindow
}
