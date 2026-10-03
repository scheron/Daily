import {join} from "node:path"
import {app} from "electron"

import {logger, setFileCoordinatorBinaryPath, StorageController} from "@daily/core"
import {APP_CONFIG} from "@daily/protocol"

import {QuickTaskController} from "@main/modules/quickTask/QuickTaskController"
import {createStorageRequestHandler} from "@main/modules/quickTask/utils/createStorageRequestHandler"
import {spawnQuickTaskProcess} from "@main/modules/quickTask/utils/spawnQuickTaskProcess"
import {HOTKEY_REQUESTS, QUICK_TASK_PROCESS_FLAG} from "@shared/constants/quickTask"
import {createBetterSqliteDriver} from "./utils/database/betterSqliteDriver"
import {awaitRendererReady} from "./utils/windows/awaitRendererReady"
import {broadcastToWindows} from "./utils/windows/broadcastToWindows"
import {focusWindow} from "./utils/windows/focusWindow"
import {loadSavedMainWindowState} from "./utils/windows/loadSavedMainWindowState"
import {waitForRendererReady} from "./utils/windows/waitForRendererReady"
import {AIController} from "./ai/AIController"
import {electronPaths} from "./config/electronPaths"
import {FocusController} from "./modules/focus/FocusController"
import {trayController} from "./modules/tray/TrayController"
import {setupFocusWindow} from "./setup/app/focusWindow"
import {setupInstanceAndDeepLinks} from "./setup/app/instance"
import {setupActivateHandler, setupAppBoot, setupDockIcon, setupQuickTaskAppBoot, setupWindowAllClosedHandler} from "./setup/app/lifecycle"
import {setupMenu} from "./setup/app/menu"
import {setupQuickTask} from "./setup/app/quickTask"
import {setupQuickTaskWindow} from "./setup/app/quickTaskWindow"
import {setupStorageSync} from "./setup/app/storage"
import {setupTrayQuickTask} from "./setup/app/trayQuickTask"
import {setupTrayVisibility} from "./setup/app/trayVisibility"
import {setupUpdateManager} from "./setup/app/updates"
import {setupMainWindowStatePersistence} from "./setup/app/windowState"
import {setupAboutIPC} from "./setup/ipc/about"
import {setupAiIPC} from "./setup/ipc/ai"
import {setupAssistantIPC} from "./setup/ipc/assistant"
import {setupFocusIPC} from "./setup/ipc/focus"
import {setupMenuIPC} from "./setup/ipc/menu"
import {setupQuickTaskIPC} from "./setup/ipc/quickTask"
import {setupSettingsIPC} from "./setup/ipc/settings"
import {setupShellIPC} from "./setup/ipc/shell"
import {setupStorageIPC} from "./setup/ipc/storage"
import {setupSyncProviderIPC} from "./setup/ipc/syncProvider"
import {setupSyncServerIPC} from "./setup/ipc/syncServer"
import {setupUpdatesIPC} from "./setup/ipc/updates"
import {setupMainWindowIPC} from "./setup/ipc/windows"
import {setupCSP} from "./setup/security/csp"
import {setupPrivilegedSchemes, setupSafeFileProtocol} from "./setup/security/protocols"
import {createMainWindow} from "./windows/main.window"
import {createSplashWindow} from "./windows/splash.window"

import type {MainWindowSettings} from "@daily/protocol"
import type {BrowserWindow} from "electron"

type AppWindows = {
  main: BrowserWindow | null
  splash: BrowserWindow | null
  about: BrowserWindow | null
  settings: BrowserWindow | null
  assistant: BrowserWindow | null
  focus: BrowserWindow | null
}

const windows: AppWindows = {
  main: null,
  splash: null,
  about: null,
  settings: null,
  assistant: null,
  focus: null,
}
let storage: StorageController | null = null
let ai: AIController | null = null
let focus: FocusController | null = null
let savedMainWindowState: MainWindowSettings | undefined
let trayQuickTask: ReturnType<typeof setupTrayQuickTask> | null = null
let quickTaskSwitch: ReturnType<typeof setupQuickTask> | null = null
let trayVisibility: ReturnType<typeof setupTrayVisibility> | null = null

const quickTask = new QuickTaskController({
  spawn: spawnQuickTaskProcess,
  handleRequest: createStorageRequestHandler(() => storage),
  onReady: async () => {
    const hotkey = (await storage?.loadSettings())?.quickTask.hotkey
    if (!hotkey) return

    const isRegistered = await quickTask.request(HOTKEY_REQUESTS.register, [hotkey])
    if (!isRegistered) logger.warn(logger.CONTEXT.APP, `Quick task hotkey could not be registered: ${hotkey}`)
  },
  onAvailabilityChange: (isAvailable) => trayQuickTask?.setAvailable(isAvailable),
})

if (process.argv.includes(QUICK_TASK_PROCESS_FLAG)) {
  setupQuickTaskAppBoot()
  setupQuickTaskWindow()
} else {
  bootDaily()
}

function bootDaily() {
  setFileCoordinatorBinaryPath(
    app.isPackaged ? join(process.resourcesPath, "file-coordinator") : join(process.cwd(), "..", "..", "resources", "file-coordinator"),
  )

  setupPrivilegedSchemes()
  setupAppBoot()
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

  app.whenReady().then(startDaily)

  app.on("will-quit", () => quickTask.stop())

  app.on("before-quit", async (event) => {
    if (focus?.holdQuit(event)) return
    if (ai) await ai.dispose()
  })
}

async function startDaily() {
  windows.splash = createSplashWindow()

  storage = new StorageController(createBetterSqliteDriver(electronPaths.dbPath()), electronPaths)
  ai = new AIController(
    storage,
    (state) => {
      broadcastToWindows(() => windows, "ai:local-state-changed", state)
    },
    (event) => {
      const target = windows.assistant ?? windows.main
      if (!target) return

      if (event.type === "required") target.webContents.send("ai:confirmation-required", event.confirmation)
      else target.webContents.send("ai:confirmation-resolved", {confirmationId: event.confirmationId})
    },
    (event) => {
      const target = windows.assistant ?? windows.main
      target?.webContents.send("ai:event", event)
    },
  )

  try {
    await storage.init()
    await ai.init()

    await storage.cleanupOrphanFiles()
    await storage.collectGarbage()
    savedMainWindowState = await loadSavedMainWindowState(storage)
    logger.lifecycle("Storage initialized")
  } catch (err) {
    logger.error("APP" as any, "Failed to initialize storage", err)
    app.quit()
    return
  }

  const followFocusWindow = setupFocusWindow(
    () => focus,
    () => windows.main,
    () => windows.focus,
    (win) => (windows.focus = win),
  )
  focus = new FocusController(storage, (session) => {
    broadcastToWindows(() => windows, "focus:changed", session)
    followFocusWindow(session)
  })

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
  setupQuickTaskIPC(quickTask, () => storage)
  setupFocusIPC(
    () => focus,
    () => windows.focus,
  )
  setupSyncServerIPC(
    () => storage,
    () => windows,
  )
  setupSyncProviderIPC(() => storage)
  setupAiIPC(
    () => ai,
    () => windows,
  )
  setupStorageSync(
    () => storage,
    () => windows,
    () => focus,
    (channel, ...args) => {
      quickTask.emit(channel, ...args)
      if (channel !== "settings:changed") return
      void trayQuickTask?.refresh()
      void quickTaskSwitch?.apply()
      void trayVisibility?.apply()
    },
  )

  trayQuickTask = setupTrayQuickTask(trayController, quickTask, () => storage)
  void trayQuickTask.refresh()
  quickTaskSwitch = setupQuickTask(quickTask, () => storage)
  trayVisibility = setupTrayVisibility(trayController, () => storage)
  await trayVisibility.apply()

  setupMainWindow(windows, {showSplash: true})

  void ai
    .getLocalModel()
    .refreshCatalog()
    .then((result) => {
      if (result === "updated") broadcastToWindows(() => windows, "ai:local-catalog-changed", undefined)
    })
    .catch((err) => logger.error(logger.CONTEXT.AI, "Background catalog refresh failed", err))

  logger.lifecycle(`${APP_CONFIG.name} started`)
}

function setupMainWindow(windows: AppWindows, options?: {showSplash?: boolean}) {
  const showSplash = options?.showSplash ?? false

  windows.main = createMainWindow(savedMainWindowState)
  const main = windows.main!
  const rendererReady = waitForRendererReady(() => windows.main)
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
      const outcome = await awaitRendererReady(rendererReady, 10_000)
      if (outcome === "timed-out") logger.warn(logger.CONTEXT.APP, "Renderer readiness timed out; showing the main window anyway")

      if (windows.splash) {
        windows.splash.close()
        windows.splash = null
      }
      logger.lifecycle("Main window displayed")
    }

    main.show()
    focusWindow(main)
    void quickTaskSwitch?.apply()
  })

  return main
}
