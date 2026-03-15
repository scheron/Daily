import {app} from "electron"

import {sleep} from "@shared/utils/common/sleep"
import {logger} from "@/utils/logger"

import {AIController} from "@/ai/AIController"
import {APP_CONFIG} from "@/config"
import {setupInstanceAndDeepLinks} from "@/setup/app/instance"
import {setupActivateHandler, setupAppIdentity, setupDockIcon, setupWindowAllClosedHandler} from "@/setup/app/lifecycle"
import {setupMenu} from "@/setup/app/menu"
import {setupStorageSync} from "@/setup/app/storage"
import {setupUpdateManager} from "@/setup/app/updates"
import {loadSavedMainWindowState, setupMainWindowStatePersistence} from "@/setup/app/windowState"
import {setupAboutIPC} from "@/setup/ipc/about"
import {setupAiIPC} from "@/setup/ipc/ai"
import {setupAssistantIPC} from "@/setup/ipc/assistant"
import {setupMenuIPC} from "@/setup/ipc/menu"
import {setupSettingsIPC} from "@/setup/ipc/settings"
import {setupShellIPC} from "@/setup/ipc/shell"
import {setupStorageIPC} from "@/setup/ipc/storage"
import {setupUpdatesIPC} from "@/setup/ipc/updates"
import {setupMainWindowIPC} from "@/setup/ipc/windows"
import {setupCSP} from "@/setup/security/csp"
import {setupPrivilegedSchemes, setupSafeFileProtocol} from "@/setup/security/protocols"
import {StorageController} from "@/storage/StorageController"
import {createMainWindow, createSplashWindow, focusWindow} from "@/windows"

import type {MainWindowSettings} from "@shared/types/storage"
import type {BrowserWindow} from "electron"

type AppWindows = {
  main: BrowserWindow | null
  splash: BrowserWindow | null
  about: BrowserWindow | null
  settings: BrowserWindow | null
  assistant: BrowserWindow | null
}

const windows: AppWindows = {main: null, splash: null, about: null, settings: null, assistant: null}
let storage: StorageController | null = null
let ai: AIController | null = null
let savedMainWindowState: MainWindowSettings | undefined

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
  ai = new AIController(storage, (state) => {
    windows.main?.webContents.send("ai:local-state-changed", state)
  })

  try {
    await storage.init()
    await ai.init()

    await storage.cleanupOrphanFiles()
    savedMainWindowState = await loadSavedMainWindowState(storage)
    logger.lifecycle("Storage initialized")
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
  setupUpdatesIPC()

  setupAboutIPC(
    () => windows.about,
    (win) => (windows.about = win),
  )

  setupSettingsIPC(
    () => windows.settings,
    (win) => (windows.settings = win),
  )

  setupAssistantIPC(
    () => windows.assistant,
    (win) => (windows.assistant = win),
  )

  setupStorageIPC(() => storage)
  setupAiIPC(
    () => ai,
    () => windows.main,
  )
  setupStorageSync(
    () => storage,
    () => windows,
  )

  setupMainWindow(windows, {showSplash: true})

  logger.lifecycle(`${APP_CONFIG.name} started`)
})

app.on("before-quit", async () => {
  if (ai) {
    await ai.dispose()
  }
})

function setupMainWindow(windows: AppWindows, options?: {showSplash?: boolean}) {
  const showSplash = options?.showSplash ?? false

  windows.main = createMainWindow(savedMainWindowState)
  const main = windows.main!
  if (storage) setupUpdateManager(main, () => storage)

  setupMenu(() => main)
  setupMainWindowStatePersistence(
    () => storage,
    () => main,
  )

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
