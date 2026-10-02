import {app, BrowserWindow, screen} from "electron"

import {ENV} from "@daily/core"

import {electronPaths} from "@main/runtime/electronPaths"

const WIDTH = 560
const BOTTOM_MARGIN = 48

const readyWindows = new WeakSet<BrowserWindow>()
const windowsAwaitingReady = new WeakSet<BrowserWindow>()

/**
 * Creates the Quick Capture panel in the helper process: frameless and transparent only for its rounded corners, floating above full-screen apps, hidden until shown.
 * A `showQuickCapture` before its renderer is ready waits until it is.
 */
export function createQuickCaptureWindow(): BrowserWindow {
  const panelWindow = new BrowserWindow({
    title: "Quick Capture",
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
    panelWindow.loadURL(`${rendererPath}#/quick-capture`)
  } else {
    panelWindow.loadFile(rendererPath, {hash: "/quick-capture"})
  }

  panelWindow.webContents.on("ipc-message", (_event, channel) => {
    if (channel !== "window:ready") return

    readyWindows.add(panelWindow)
    if (windowsAwaitingReady.delete(panelWindow)) showQuickCapture(panelWindow)
  })

  panelWindow.on("blur", () => hideQuickCapture(panelWindow))

  return panelWindow
}

/** Presents the panel at the bottom centre of the display under the cursor and gives it the keyboard. Before its renderer is ready the show is deferred until it is. */
export function showQuickCapture(panelWindow: BrowserWindow) {
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
  panelWindow.webContents.send("quick-capture:shown")
}

/** Puts the panel away and hides the helper app, so macOS returns the keyboard to the app that was active before. */
export function hideQuickCapture(panelWindow: BrowserWindow) {
  if (panelWindow.isDestroyed() || !panelWindow.isVisible()) return

  panelWindow.hide()
  app.hide()
}

/** Shows the panel, or hides it when it is already visible. */
export function toggleQuickCapture(panelWindow: BrowserWindow) {
  if (panelWindow.isDestroyed()) return

  if (panelWindow.isVisible()) hideQuickCapture(panelWindow)
  else showQuickCapture(panelWindow)
}

/** Sets the window's height to `height` px, keeping its bottom edge where it is, so the panel grows upward. */
export function resizeQuickCapture(panelWindow: BrowserWindow, height: number) {
  if (panelWindow.isDestroyed() || !Number.isFinite(height)) return

  const bounds = panelWindow.getBounds()
  const area = screen.getDisplayNearestPoint({x: bounds.x, y: bounds.y + bounds.height - 1}).workArea
  const bottom = Math.min(bounds.y + bounds.height, area.y + area.height)
  const nextHeight = Math.min(Math.max(Math.round(height), 1), bottom - area.y - BOTTOM_MARGIN)

  panelWindow.setBounds({x: bounds.x, y: bottom - nextHeight, width: bounds.width, height: nextHeight})
}
