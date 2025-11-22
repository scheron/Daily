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

type AppWindows = {main: BrowserWindow | null; splash: BrowserWindow | null; timer: BrowserWindow | null; devTools: BrowserWindow | null}

const windows: AppWindows = {main: null, splash: null, timer: null, devTools: null}
let storage: StorageController | null = null

setupPrivilegedSchemes()
setupAppIdentity()
setupDockIcon()
setupWindowAllClosedHandler()

setupInstanceAndDeepLinks(
  () => storage,
  () => windows.main,
)

setupActivateHandler(
  () => storage,
  () => windows.main,
  () => setupMainWindow(windows),
)

app.whenReady().then(async () => {
  windows.splash = createSplashWindow()

  storage = new StorageController()

  try {
    await storage.init()
    await storage.cleanupOrphanFiles()
    console.log("✅ Storage initialized")

    await setupDbViewerIPC()
  } catch (err) {
    console.error("❌ Failed to initialize storage:", err)
    app.quit()
    return
  }

  setupSafeFileProtocol(storage)
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

  setupStorageIPC(() => storage!)
  setupStorageEvents(() => windows.main)
  setupStorageSync(
    () => storage!,
    () => windows.main,
  )

  const main = setupMainWindow(windows, {showSplash: true})

  setupUpdateManager(main)

  console.log(`🚀 ${APP_CONFIG.name} started`)
})

function setupMainWindow(windows: AppWindows, options?: {showSplash?: boolean}) {
  const showSplash = options?.showSplash ?? false

  windows.main = createMainWindow()
  const main = windows.main!

  setupMenu(() => main)

  main.on("closed", () => {
    if (windows.timer && !windows.timer.isDestroyed()) {
      windows.timer.close()
      windows.timer = null
    }

    windows.main = null
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
