import {BrowserWindow} from "electron"

import {ENV} from "@daily/core"

import {electronPaths} from "@main/runtime/electronPaths"
import {focusWindow} from "@main/utils/windows/focusWindow"

import type {Rectangle} from "electron"

/** Creates the detached focus session window, always on top, with its bottom-right corner 16 px inside `mainBounds`, or centred without them. */
export function createFocusWindow(mainBounds?: Rectangle): BrowserWindow {
  const width = 340
  const height = 500

  const detachedWindow = new BrowserWindow({
    title: "Focus session",
    width,
    height,
    x: mainBounds && mainBounds.x + mainBounds.width - width - 16,
    y: mainBounds && mainBounds.y + mainBounds.height - height - 16,
    center: !mainBounds,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: {x: 14, y: 9},
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
    detachedWindow.loadURL(`${rendererPath}#/focus`)
  } else {
    detachedWindow.loadFile(rendererPath, {hash: "/focus"})
  }

  detachedWindow.webContents.once("ipc-message", (_event, channel) => {
    if (channel === "window:ready") {
      detachedWindow.show()
      focusWindow(detachedWindow)
    }
  })

  return detachedWindow
}
