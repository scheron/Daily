import {BrowserWindow, screen} from "electron"

import {logger} from "@/utils/logger"

import {APP_CONFIG, Env, fsPaths} from "@/config"

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: APP_CONFIG.windows.main.width,
    height: APP_CONFIG.windows.main.minHeight,
    show: false,
    type: "panel",
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: fsPaths.preload(),
      sandbox: true,
      devTools: Env.isDevelopment(),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })
  win.setAlwaysOnTop(true, "floating")
  win.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true})
  win.loadURL(fsPaths.rendererURL("/main"))
  logger.info(logger.CONTEXT.WINDOW, "Main window created")
  return win
}

export function createSettingsWindow(): BrowserWindow {
  const cfg = APP_CONFIG.windows.settings
  const win = new BrowserWindow({
    width: cfg.width,
    height: cfg.height,
    minWidth: cfg.minWidth,
    minHeight: cfg.minHeight,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0a",
    resizable: true,
    webPreferences: {
      preload: fsPaths.preload(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })
  win.loadURL(fsPaths.rendererURL("/settings"))
  logger.info(logger.CONTEXT.WINDOW, "Settings window created")
  return win
}

export function showMain(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    logger.warn(logger.CONTEXT.WINDOW, "showMain: skipping — window is destroyed")
    return
  }
  logger.debug(logger.CONTEXT.WINDOW, "showMain: positioning & showing")
  const bounds = win.getBounds()
  const {x, y} = resolveMainPosition(bounds.width, bounds.height)
  win.setBounds({x, y, width: bounds.width, height: bounds.height})
  win.show()
  win.focus()
}

export function hideMain(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    logger.warn(logger.CONTEXT.WINDOW, "hideMain: skipping — window is destroyed")
    return
  }
  if (!win.isVisible()) return
  logger.debug(logger.CONTEXT.WINDOW, "hideMain: hiding")
  win.hide()
}

function resolveMainPosition(width: number, height: number): {x: number; y: number} {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + (display.workArea.height - height) / 2)
  return {x, y}
}

export function focusOrCreate(getWin: () => BrowserWindow | null, create: () => BrowserWindow): BrowserWindow {
  const existing = getWin()
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return existing
  }
  return create()
}
