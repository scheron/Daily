import {app} from "electron"

import type {BrowserWindow} from "electron"

import {APP_CONFIG} from "./config.js"
import {setupInstanceAndDeepLinks} from "./setup/app/instance.js"
import {setupActivateHandler, setupAppIdentity, setupDockIcon, setupStorageSync, setupWindowAllClosedHandler} from "./setup/app/lifecycle.js"
import {setupMenu} from "./setup/app/menu.js"
import {setupStorageEvents} from "./setup/app/storage.js"
import {setupDbViewerIPC, setupDevToolsIPC} from "./setup/ipc/devtools.js"
import {setupMenuIPC} from "./setup/ipc/menu.js"
import {setupStorageIPC} from "./setup/ipc/storage.js"
import {setupTimerIPC} from "./setup/ipc/timer.js"
import {setupMainWindowIPC} from "./setup/ipc/windows.js"
import {setupCSP} from "./setup/security/csp.js"
import {setupPrivilegedSchemes, setupSafeFileProtocol} from "./setup/security/protocols.js"
import {setupUpdateManager} from "./setup/updates/updater.js"
import {StorageController} from "./storage/StorageController.js"
import {sleep} from "./utils/common.js"
import {createMainWindow, createSplashWindow, focusWindow} from "./windows.js"

type AppWindows = {
  main: BrowserWindow | null
  splash: BrowserWindow | null
  timer: BrowserWindow | null
  devTools: BrowserWindow | null
}

type AppContext = {
  storage: StorageController | null
  windows: AppWindows
}

const ctx: AppContext = {
  storage: null,
  windows: {
    main: null,
    splash: null,
    timer: null,
    devTools: null,
  },
}

function closeTimerWindow(ctx: AppContext) {
  const {windows} = ctx
  if (windows.timer && !windows.timer.isDestroyed()) {
    windows.timer.close()
    windows.timer = null
  }
}

function attachMainWindowClosedHandler(ctx: AppContext, win: BrowserWindow) {
  win.on("closed", () => {
    closeTimerWindow(ctx)
    ctx.windows.main = null
  })
}

function setupWindowHandlers(main: BrowserWindow, ctx: AppContext) {
  const {windows} = ctx

  setupMainWindowIPC(() => main)

  setupTimerIPC(
    () => main,
    () => windows.timer,
    (win) => (windows.timer = win),
  )

  setupDevToolsIPC(
    () => main,
    () => windows.devTools,
    (win) => (windows.devTools = win),
  )

  setupMenuIPC(() => main)
  setupMenu(() => main)

  setupStorageEvents(() => main)
}

function createInitialMainWindow(ctx: AppContext) {
  const {windows} = ctx

  windows.main = createMainWindow()
  const main = windows.main!

  attachMainWindowClosedHandler(ctx, main)
  setupWindowHandlers(main, ctx)

  main.once("ready-to-show", async () => {
    await sleep(1000)

    if (windows.splash) {
      windows.splash.close()
      windows.splash = null
    }

    main.show()
    focusWindow(main)
    console.log("✅ Main window displayed")
  })

  return main
}

function createMainWindowForActivation(ctx: AppContext) {
  const {windows} = ctx

  windows.main = createMainWindow()
  const main = windows.main!

  attachMainWindowClosedHandler(ctx, main)
  setupWindowHandlers(main, ctx)

  main.once("ready-to-show", () => {
    main.show()
    focusWindow(main)
  })

  return main
}

setupPrivilegedSchemes()
setupAppIdentity()
setupDockIcon()
setupWindowAllClosedHandler()

setupInstanceAndDeepLinks(
  () => ctx.storage!,
  () => ctx.windows.main,
)

setupActivateHandler(
  () => ctx.storage!,
  () => ctx.windows.main,
  () => createMainWindowForActivation(ctx),
  (win) => setupWindowHandlers(win, ctx),
)

app.whenReady().then(async () => {
  const {windows} = ctx

  windows.splash = createSplashWindow()

  ctx.storage = new StorageController()

  try {
    await ctx.storage.init()
    await ctx.storage.cleanupOrphanFiles()
    console.log("✅ Storage initialized")

    await setupDbViewerIPC()
  } catch (err) {
    console.error("❌ Failed to initialize storage:", err)
    app.quit()
    return
  }

  setupSafeFileProtocol(ctx.storage)
  setupCSP()

  const main = createInitialMainWindow(ctx)

  setupUpdateManager(main)

  setupStorageIPC(ctx.storage)
  setupStorageSync(
    () => ctx.storage!,
    () => ctx.windows.main,
  )

  console.log(`🚀 ${APP_CONFIG.name} started`)
})
