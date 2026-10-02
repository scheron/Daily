import {BrowserWindow, screen} from "electron"

import {ENV} from "@daily/core"

import {electronPaths} from "@main/runtime/electronPaths"

import type {QuickCaptureMenu} from "@shared/types/quickCapture"

const WIDTH = 240
const GAP = 4

type MenuState = {isReady: boolean; menu: QuickCaptureMenu | null; height: number | null}

const states = new WeakMap<BrowserWindow, MenuState>()

/** Creates the hidden window that draws the panel's `/` menu above the panel: frameless, transparent only for its rounded corners, never focusable, floating above full-screen apps. It is ordered out only together with the panel. */
export function createQuickCaptureMenuWindow(panelWindow: BrowserWindow): BrowserWindow {
  const menuWindow = new BrowserWindow({
    title: "Quick Capture menu",
    width: WIDTH,
    height: 1,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    focusable: false,
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
  const state: MenuState = {isReady: false, menu: null, height: null}
  states.set(menuWindow, state)

  menuWindow.setAlwaysOnTop(true, "pop-up-menu")
  menuWindow.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true, skipTransformProcessType: true})

  const rendererPath = electronPaths.renderer()
  if (rendererPath.startsWith("http")) {
    menuWindow.loadURL(`${rendererPath}#/quick-capture-menu`)
  } else {
    menuWindow.loadFile(rendererPath, {hash: "/quick-capture-menu"})
  }

  menuWindow.webContents.on("ipc-message", (_event, channel) => {
    if (channel !== "window:ready") return

    state.isReady = true
    if (state.menu) menuWindow.webContents.send("quick-capture-menu:menu", state.menu)
  })

  const onPanelHide = () => {
    setQuickCaptureMenu(menuWindow, panelWindow, null)
    if (!menuWindow.isDestroyed() && menuWindow.isVisible()) menuWindow.hide()
  }
  const onPanelResize = () => {
    if (state.height !== null && menuWindow.isVisible()) placeQuickCaptureMenu(menuWindow, panelWindow, state.height)
  }
  panelWindow.on("hide", onPanelHide)
  panelWindow.on("resize", onPanelResize)
  menuWindow.on("closed", () => {
    if (panelWindow.isDestroyed()) return
    panelWindow.off("hide", onPanelHide)
    panelWindow.off("resize", onPanelResize)
  })

  return menuWindow
}

/** Hands the menu window what the panel's editor shows, or closes it for `null`: while the panel is visible the window is only made invisible and mouse-transparent, because ordering it out repeatedly makes macOS blur the panel. The window is placed and shown once its renderer reports the height of the rows. */
export function setQuickCaptureMenu(menuWindow: BrowserWindow, panelWindow: BrowserWindow, menu: QuickCaptureMenu | null) {
  const state = states.get(menuWindow)
  if (!state || menuWindow.isDestroyed()) return
  if (menu && !panelWindow.isVisible()) return

  state.menu = menu
  if (!menu) state.height = null
  if (state.isReady) menuWindow.webContents.send("quick-capture-menu:menu", menu)
  if (!menu && menuWindow.isVisible()) {
    menuWindow.setOpacity(0)
    menuWindow.setIgnoreMouseEvents(true)
  }
}

/** Puts the window of `height` px just above the panel, its left edge at the caret, kept inside the work area, and shows it without taking focus. */
export function placeQuickCaptureMenu(menuWindow: BrowserWindow, panelWindow: BrowserWindow, height: number) {
  const state = states.get(menuWindow)
  const menu = state?.menu
  if (
    !state ||
    !menu ||
    menuWindow.isDestroyed() ||
    panelWindow.isDestroyed() ||
    !panelWindow.isVisible() ||
    !Number.isFinite(height) ||
    !Number.isFinite(menu.caretX)
  )
    return

  state.height = height
  const panel = panelWindow.getBounds()
  const area = screen.getDisplayNearestPoint({x: panel.x, y: panel.y}).workArea
  const bottom = panel.y - GAP
  const nextHeight = Math.min(Math.max(Math.round(height), 1), Math.max(bottom - area.y, 1))
  const x = Math.min(Math.max(Math.round(panel.x + menu.caretX), area.x), area.x + area.width - WIDTH)

  menuWindow.setBounds({x, y: bottom - nextHeight, width: WIDTH, height: nextHeight})
  menuWindow.setOpacity(1)
  menuWindow.setIgnoreMouseEvents(false)
  if (!menuWindow.isVisible()) menuWindow.showInactive()
}
