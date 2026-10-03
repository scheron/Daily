import {app, BrowserWindow, screen} from "electron"

import {ENV} from "@daily/core"

import {electronPaths} from "@main/config/electronPaths"

const WIDTH = 560
const BOTTOM_MARGIN = 48

const readyWindows = new WeakSet<BrowserWindow>()
const windowsAwaitingReady = new WeakSet<BrowserWindow>()

/**
 * Creates the Quick task panel in the Quick task process: frameless and transparent only for its rounded corners, floating above full-screen apps, hidden until shown.
 * A `showQuickTask` before its renderer is ready waits until it is.
 */
export function createQuickTaskWindow(): BrowserWindow {
  const panelWindow = new BrowserWindow({
    title: "Quick task",
    width: WIDTH,
    height: 170,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      devTools: ENV.isDevelopment,
      preload: electronPaths.preload(),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  })

  panelWindow.setAlwaysOnTop(true, "floating")
  panelWindow.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true, skipTransformProcessType: true})

  const rendererPath = electronPaths.renderer()
  if (rendererPath.startsWith("http")) {
    panelWindow.loadURL(`${rendererPath}#/quick-task`)
  } else {
    panelWindow.loadFile(rendererPath, {hash: "/quick-task"})
  }

  panelWindow.webContents.on("ipc-message", (_event, channel) => {
    if (channel !== "window:ready") return

    readyWindows.add(panelWindow)
    if (windowsAwaitingReady.delete(panelWindow)) showQuickTask(panelWindow)
  })

  panelWindow.on("blur", () => hideQuickTask(panelWindow))

  return panelWindow
}

/** Presents the panel at the bottom centre of the display under the cursor and gives it the keyboard. Before its renderer is ready the show is deferred until it is. */
export function showQuickTask(panelWindow: BrowserWindow) {
  if (panelWindow.isDestroyed()) return

  if (!readyWindows.has(panelWindow)) {
    windowsAwaitingReady.add(panelWindow)
    return
  }

  const {height} = panelWindow.getBounds()
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea

  panelWindow.setBounds({
    x: Math.round(area.x + (area.width - WIDTH) / 2),
    y: area.y + area.height - BOTTOM_MARGIN - height,
    width: WIDTH,
    height,
  })

  panelWindow.show()
  panelWindow.focus()
  panelWindow.webContents.focus()
  panelWindow.webContents.send("quick-task:shown")
}

/** Puts the panel away and hides the Quick task app, so macOS returns the keyboard to the app that was active before. */
export function hideQuickTask(panelWindow: BrowserWindow) {
  if (panelWindow.isDestroyed() || !panelWindow.isVisible()) return

  panelWindow.hide()
  app.hide()
}

/** Shows the panel, or hides it when it is already visible. */
export function toggleQuickTask(panelWindow: BrowserWindow) {
  if (panelWindow.isDestroyed()) return

  if (panelWindow.isVisible()) hideQuickTask(panelWindow)
  else showQuickTask(panelWindow)
}

/** Sets the window's height to `height` px, keeping its bottom edge where it is, so the panel grows upward. */
export function resizeQuickTask(panelWindow: BrowserWindow, height: number) {
  if (panelWindow.isDestroyed() || !Number.isFinite(height)) return

  const bounds = panelWindow.getBounds()
  const area = screen.getDisplayNearestPoint({x: bounds.x, y: bounds.y + bounds.height - 1}).workArea
  const bottom = Math.min(bounds.y + bounds.height, area.y + area.height)
  const nextHeight = Math.min(Math.max(Math.round(height), 1), bottom - area.y - BOTTOM_MARGIN)

  panelWindow.setBounds({x: bounds.x, y: bottom - nextHeight, width: bounds.width, height: nextHeight})
}
