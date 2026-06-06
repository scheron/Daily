import {app} from "electron"

import {logger} from "@/utils/logger"

import {AIController} from "@/ai/AIController"
import {APP_CONFIG, Env} from "@/config"
import {applyDockVisibility} from "@/setup/app/dock"
import {getRegisteredHotkey, registerToggleHotkey, unregisterAllHotkeys} from "@/setup/app/hotkeys"
import {setupSingleInstance} from "@/setup/app/instance"
import {setupActivateHandler, setupAppIdentity, setupBeforeQuitHandler, setupLoginItem, setupWindowAllClosedHandler} from "@/setup/app/lifecycle"
import {setupMenu} from "@/setup/app/menu"
import {setupStorageBroadcasts} from "@/setup/app/storage"
import {destroyTray, setupTray} from "@/setup/app/tray"
import {applySavedState, persistOnChange} from "@/setup/app/windowState"
import {buildAiBroadcast, setupAiIPC} from "@/setup/ipc/ai"
import {setupAppIPC} from "@/setup/ipc/app"
import {setupHistoryIPC} from "@/setup/ipc/history"
import {setupHotkeyIPC} from "@/setup/ipc/hotkey"
import {setupLoggingIPC} from "@/setup/ipc/logging"
import {setupSettingsIPC} from "@/setup/ipc/settings"
import {setupWindowIPC} from "@/setup/ipc/window"
import {setupCSP} from "@/setup/security/csp"
import {setupPrivilegedSchemes} from "@/setup/security/protocols"
import {StorageController} from "@/storage/StorageController"
import {createMainWindow, createSettingsWindow, focusOrCreate, hideMain, showMain} from "@/windows"

import type {BrowserWindow} from "electron"

type Windows = {
  main: BrowserWindow | null
  settings: BrowserWindow | null
}

const windows: Windows = {main: null, settings: null}
let storage: StorageController | null = null
let ai: AIController | null = null
let isQuitting = false

setupPrivilegedSchemes()
setupAppIdentity()
setupLoggingIPC()

setupWindowAllClosedHandler()

function safeShowMain(origin: string): void {
  const win = windows.main

  logger.info("APP", `safeShowMain from ${origin}`, {
    mainRef: !!win,
    isDestroyed: win ? win.isDestroyed() : null,
    isQuitting,
  })

  if (win && !win.isDestroyed()) {
    showMain(win)
    ai?.prewarm()
  }
}

function openSettings(): void {
  const win = focusOrCreate(
    () => windows.settings,
    () => {
      const w = createSettingsWindow()
      windows.settings = w
      attachWindowState("settings", w)
      return w
    },
  )
  win.show()
  win.focus()
}

function safeOpenSettings(origin: string): void {
  logger.info("APP", `safeOpenSettings from ${origin}`)
  openSettings()
}

async function requestHasModel(): Promise<boolean> {
  return !!ai && (await ai.hasUsableModel())
}

async function requestMain(origin: string): Promise<void> {
  if (await requestHasModel()) {
    safeShowMain(origin)
    return
  }
  safeOpenSettings(origin)
}

function toggleMain(origin: string): void {
  const mainWin = windows.main
  if (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) {
    hideMain(mainWin)
    return
  }
  const settingsWin = windows.settings
  if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) {
    settingsWin.hide()
    return
  }
  requestMain(origin)
}

setupSingleInstance(() => void requestMain("second-instance"))
setupActivateHandler(() => safeOpenSettings("activate"))

setupBeforeQuitHandler(async () => {
  logger.lifecycle("before-quit handler invoked")

  if (isQuitting) {
    logger.info("APP", "before-quit: already quitting, skipping")
    return
  }

  isQuitting = true
  const main = windows.main
  if (main && !main.isDestroyed() && main.isVisible()) {
    main.hide()
    await new Promise<void>((resolve) => setTimeout(resolve, 150))
  }
  unregisterAllHotkeys()
  destroyTray()
  storage?.dispose()
  await ai?.dispose()
  ai = null
  logger.lifecycle("before-quit cleanup complete")
})

app.whenReady().then(async () => {
  storage = new StorageController()

  try {
    await storage.init()
    logger.lifecycle("Storage initialized")
  } catch (err) {
    logger.error("APP", "Failed to initialize storage", err)
    app.quit()
    return
  }

  setupStorageBroadcasts(
    () => storage,
    () => {
      return Object.values(windows).filter((w): w is BrowserWindow => !!w && !w.isDestroyed())
    },
  )

  const aiBroadcast = buildAiBroadcast(() => Object.values(windows).filter((w): w is BrowserWindow => !!w && !w.isDestroyed()))
  ai = new AIController(storage, aiBroadcast)
  try {
    await ai.init()
    logger.lifecycle("AI initialized")
  } catch (err) {
    logger.error("APP", "Failed to initialize AI", err)
  }
  setupAiIPC(() => ai)

  const settings = await storage.loadSettings()

  applyDockVisibility(settings.showDock, () => windows.settings)
  setupLoginItem(settings.launchOnStartup)

  setupCSP()

  setupSettingsIPC(() => storage)

  const modelGate = {hasModel: requestHasModel, openSettings}

  setupHotkeyIPC({
    getMain: () => windows.main,
    getStorage: () => storage,
    ...modelGate,
  })

  setupWindowIPC({
    getMain: () => windows.main,
    openSettings: () => openSettings(),
    getAi: () => ai,
  })

  setupHistoryIPC(() => storage)
  setupAppIPC()

  setupMenu({
    "window:open-settings": () => openSettings(),
  })

  windows.main = createMainWindow()

  windows.main.on("closed", () => {
    logger.info("WINDOW", "main closed event — clearing reference")
    windows.main = null
  })

  windows.main.on("blur", () => {
    const win = windows.main
    logger.debug("WINDOW", "main blur", {hasRef: !!win, isDestroyed: win ? win.isDestroyed() : null})
    if (!win || win.isDestroyed()) return
    if (win.webContents.isDevToolsOpened()) return
    hideMain(win)
  })

  windows.main.on("focus", () => logger.debug("WINDOW", "main focus"))
  windows.main.on("show", () => logger.debug("WINDOW", "main show"))
  windows.main.on("hide", () => {
    logger.debug("WINDOW", "main hide")
    const win = windows.main
    if (win && !win.isDestroyed()) win.webContents.send("window:main-hidden")
  })
  windows.main.webContents.on("render-process-gone", (_e, details) => logger.error("WINDOW", "main renderer gone", details))
  windows.main.webContents.on("did-fail-load", (_e, code, desc, url) => logger.error("WINDOW", "main did-fail-load", {code, desc, url}))

  if (Env.isDevelopment()) {
    windows.main.once("ready-to-show", async () => {
      if (await requestHasModel()) safeShowMain("dev-auto-show")
      else safeOpenSettings("dev-auto-show")
    })
  }

  registerToggleHotkey(settings.hotkey, () => windows.main, modelGate)

  setupTray(
    {
      toggleMain: () => toggleMain("tray"),
      onOpenSettings: () => openSettings(),
    },
    () => getRegisteredHotkey() ?? settings.hotkey,
  )

  if (!(await requestHasModel())) {
    logger.info("APP", "No usable model on launch — opening Settings")
    openSettings()
  }

  logger.lifecycle(`${APP_CONFIG.name} ready`)
})

function attachWindowState(key: "settings", win: BrowserWindow): void {
  if (!storage) return

  storage.loadSettings().then((s) => applySavedState(win, s.windows[key]))
  persistOnChange(win, key, storage)

  win.on("closed", () => {
    windows.settings = null
  })
}
