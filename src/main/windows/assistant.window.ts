import {BrowserWindow} from "electron"

import {focusWindow} from "@/utils/windows/focusWindow"

import {APP_CONFIG, ENV, fsPaths} from "@/config"

export function createAssistantWindow(): BrowserWindow {
  const assistantWindow = new BrowserWindow({
    title: "AI Assistant",
    width: APP_CONFIG.window.assistant.width,
    height: APP_CONFIG.window.assistant.height,
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
    icon: fsPaths.icon(),
    webPreferences: {
      devTools: ENV.isDevelopment,
      preload: fsPaths.preload(),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })

  const rendererPath = fsPaths.renderer()
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
