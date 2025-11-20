import {app, protocol} from "electron"

import type {BrowserWindow} from "electron"

import {APP_CONFIG} from "./config.js"
import {setupDbViewerIPC, setupDevToolsIPC, setupWindowIPC as setupMainWindowIPC, setupMenuIPC, setupStorageIPC, setupTimerIPC} from "./core/setup/ipc.js"
import {setupMenu} from "./core/menu/base.js"
import {
  setupActivateHandler,
  setupAppProtocol,
  setupDockIcon,
  setupSingleInstanceLock,
  setupStorageSync,
  setupWindowAllClosedHandler,
} from "./core/setup/appLifecycle.js"
import {setupCSP} from "./core/setup/csp.js"
import {handleDeepLink, setupDeepLinks} from "./core/setup/deepLinks.js"
import {setupSafeFileProtocol} from "./core/setup/protocols.js"
import {setupUpdateManager} from "./core/setup/updater.js"
import {StorageController} from "./core/storage/StorageController.js"
import {setupStorageEvents} from "./core/storage/events.js"
import {createMainWindow, createSplashWindow, focusWindow} from "./core/windows.js"
import {sleep} from "./utils/common.js"

let storage: StorageController
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let timerWindow: BrowserWindow | null = null
let devToolsWindow: BrowserWindow | null = null

APP_CONFIG.privilegedSchemes.forEach((scheme) => protocol.registerSchemesAsPrivileged([scheme]))

// prettier-ignore
function setupWindowHandlers(window: BrowserWindow) {
  setupMainWindowIPC(() => window)
  setupTimerIPC(() => window, () => timerWindow, (win) => (timerWindow = win))
  setupDevToolsIPC(() => window, () => devToolsWindow, (win) => (devToolsWindow = win))
  setupMenuIPC(() => window)
  setupMenu(() => window)
  setupDeepLinks(() => window)
  setupStorageEvents(() => window)
}

setupAppProtocol()
setupDockIcon()
setupWindowAllClosedHandler()

setupSingleInstanceLock(
  () => storage,
  () => mainWindow,
  handleDeepLink,
)

setupActivateHandler(
  () => storage,
  () => mainWindow,
  () => {
    mainWindow = createMainWindow()
    setupWindowHandlers(mainWindow)

    mainWindow.on("closed", () => {
      if (timerWindow && !timerWindow.isDestroyed()) {
        timerWindow.close()
        timerWindow = null
      }
      mainWindow = null
    })

    return mainWindow
  },
  setupWindowHandlers,
)

app.whenReady().then(async () => {
  splashWindow = createSplashWindow()

  storage = new StorageController()
  try {
    await storage.init()
    await storage.cleanupOrphanFiles()

    console.log(`✅ Storage initialized`)

    await setupDbViewerIPC()
  } catch (err) {
    console.error("❌ Failed to initialize storage:", err)
    app.quit()
    return
  }

  setupStorageIPC(storage)

  mainWindow = createMainWindow()

  setupWindowHandlers(mainWindow)
  setupUpdateManager(mainWindow)

  // Close timer window when main window is closed
  mainWindow.on("closed", () => {
    if (timerWindow && !timerWindow.isDestroyed()) {
      timerWindow.close()
      timerWindow = null
    }
    mainWindow = null
  })

  setupSafeFileProtocol(storage)
  setupCSP()

  mainWindow.once("ready-to-show", async () => {
    await sleep(1000)

    if (splashWindow) {
      splashWindow.close()
      splashWindow = null
    }
    mainWindow!.show()
    focusWindow(mainWindow!)
    console.log("✅ Main window displayed")
  })

  setupStorageSync(
    () => storage,
    () => mainWindow,
  )

  const urlArg = process.argv.find((arg) => arg.startsWith(`${APP_CONFIG.protocol}://`))
  if (urlArg) {
    setTimeout(() => handleDeepLink(urlArg, mainWindow!), 1000)
  }
})
