import {app} from "electron"

import {sleep} from "@shared/utils/common/sleep"
import {logger} from "@/utils/logger"

import {APP_CONFIG} from "@/config"
import {setupInstanceAndDeepLinks} from "@/setup/app/instance"
import {setupActivateHandler, setupAppIdentity, setupDockIcon, setupWindowAllClosedHandler} from "@/setup/app/lifecycle"
import {setupMenu} from "@/setup/app/menu"
import {setupStorageSync} from "@/setup/app/storage"
import {setupDbViewerIPC, setupDevToolsIPC} from "@/setup/ipc/devtools"
import {setupMenuIPC} from "@/setup/ipc/menu"
import {setupShellIPC} from "@/setup/ipc/shell"
import {setupStorageIPC} from "@/setup/ipc/storage"
import {setupMainWindowIPC} from "@/setup/ipc/windows"
import {setupMcpHttpApi} from "@/setup/mcp/httpApi"
import {setupCSP} from "@/setup/security/csp"
import {setupPrivilegedSchemes, setupSafeFileProtocol} from "@/setup/security/protocols"
import {setupUpdateManager} from "@/setup/updates/updater"
import {StorageController} from "@/storage/StorageController"
import {createMainWindow, createSplashWindow, focusWindow} from "@/windows"

import type {BrowserWindow} from "electron"

type AppWindows = {main: BrowserWindow | null; splash: BrowserWindow | null; devTools: BrowserWindow | null}

const windows: AppWindows = {main: null, splash: null, devTools: null}
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
    await storage.loadSettings()
    logger.lifecycle("Storage initialized")

    await setupDbViewerIPC()
  } catch (err) {
    logger.error("APP" as any, "Failed to initialize storage", err)
    app.quit()
    return
  }

  setupSafeFileProtocol(storage)
  setupCSP()

  setupShellIPC()
  setupMainWindowIPC(() => windows.main)
  setupMenuIPC(() => windows.main)

  setupDevToolsIPC(
    () => windows.main,
    () => windows.devTools,
    (win) => (windows.devTools = win),
  )

  setupStorageIPC(() => storage)
  setupStorageSync(
    () => storage,
    () => windows.main,
  )

  // Start HTTP API for MCP server integration
  setupMcpHttpApi(() => storage)

  const main = setupMainWindow(windows, {showSplash: true})

  setupUpdateManager(main)

  logger.lifecycle(`${APP_CONFIG.name} started`)
})

function setupMainWindow(windows: AppWindows, options?: {showSplash?: boolean}) {
  const showSplash = options?.showSplash ?? false

  windows.main = createMainWindow()
  const main = windows.main!

  setupMenu(() => main)

  main.on("closed", () => {
    windows.main = null
  })

  main.once("ready-to-show", async () => {
    if (showSplash) {
      await sleep(1000)

      if (windows.splash) {
        windows.splash.close()
        windows.splash = null
      }
      logger.lifecycle("Main window displayed")
    }

    main.show()
    focusWindow(main)
  })

  return main
}
