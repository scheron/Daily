import {app} from "electron"

import type {BrowserWindow} from "electron"

import {APP_CONFIG} from "./config.js"
import {setupMenuIPC, setupStorageIPC, setupWindowIPC} from "./core/ipc.js"
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
import {StorageController} from "./core/storage/controller.js"
import {setupStorageEvents} from "./core/storage/events.js"
import {createMainWindow, createSplashWindow, focusWindow} from "./core/windows.js"
import {sleep} from "./utils/common.js"

let storage: StorageController
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let timerWindow: BrowserWindow | null = null

const setupWindowHandlers = (window: BrowserWindow) => {
  // prettier-ignore
  setupWindowIPC(window, () => timerWindow, (win) => (timerWindow = win))
  setupMenuIPC(window)
  setupMenu(window)
  setupDeepLinks(window)
  setupStorageEvents(() => mainWindow)
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
    return mainWindow
  },
  setupWindowHandlers,
)

app.whenReady().then(async () => {
  splashWindow = createSplashWindow()

  storage = new StorageController()
  try {
    await storage.init()
    await storage.cleanupOrphanAssets()
    console.log(`✅ Storage initialized`)
  } catch (err) {
    console.error("❌ Failed to initialize storage:", err)
    app.quit()
    return
  }

  setupStorageIPC(storage)

  mainWindow = createMainWindow()
  setupWindowHandlers(mainWindow)
  setupUpdateManager(mainWindow)

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
