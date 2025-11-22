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
  () => setupMainWindow(ctx),
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

  setupMainWindowIPC(() => windows.main)
  setupMenuIPC(() => windows.main)

  setupTimerIPC(
    () => windows.main,
    () => windows.timer,
    (win) => (windows.timer = win),
  )

  setupDevToolsIPC(
    () => windows.main,
    () => windows.devTools,
    (win) => (windows.devTools = win),
  )

  setupStorageIPC(() => ctx.storage!)
  setupStorageEvents(() => windows.main)
  setupStorageSync(
    () => ctx.storage!,
    () => windows.main,
  )

  const main = setupMainWindow(ctx, {showSplash: true})

  setupUpdateManager(main)

  console.log(`🚀 ${APP_CONFIG.name} started`)
})

function setupMainWindow(ctx: AppContext, options?: {showSplash?: boolean}) {
  const {windows} = ctx
  const showSplash = options?.showSplash ?? false

  windows.main = createMainWindow()
  const main = windows.main!

  setupMenu(() => main)

  main.on("closed", () => {
    if (ctx.windows.timer && !ctx.windows.timer.isDestroyed()) {
      ctx.windows.timer.close()
      ctx.windows.timer = null
    }

    ctx.windows.main = null
  })

  main.once("ready-to-show", async () => {
    if (showSplash) {
      await sleep(1000)

      if (windows.splash) {
        windows.splash.close()
        windows.splash = null
      }
      console.log("✅ Main window displayed")
    }

    main.show()
    focusWindow(main)
  })

  return main
}
