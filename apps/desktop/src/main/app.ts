import {app, powerMonitor} from "electron"

import {logger, setFileCoordinatorBinaryPath, StorageController} from "@daily/core"
import {APP_CONFIG} from "@daily/protocol"

import {TaskTimersController} from "@main/modules/task-timers/TaskTimersController"
import {createBetterSqliteDriver} from "./utils/database/betterSqliteDriver"
import {awaitRendererReady} from "./utils/windows/awaitRendererReady"
import {broadcastToWindows} from "./utils/windows/broadcastToWindows"
import {focusWindow} from "./utils/windows/focusWindow"
import {loadSavedMainWindowState} from "./utils/windows/loadSavedMainWindowState"
import {waitForRendererReady} from "./utils/windows/waitForRendererReady"
import {AIController} from "./ai/AIController"
import {electronPaths} from "./config/electronPaths"
import {IS_DEMO} from "./demo/profile"
import {seedDemoStorage} from "./demo/seedDemoStorage"
import {trayController} from "./modules/tray/TrayController"
import {setupInstanceAndDeepLinks} from "./setup/app/instance"
import {setupActivateHandler, setupAppBoot, setupDockIcon, setupWindowAllClosedHandler} from "./setup/app/lifecycle"
import {setupMenu} from "./setup/app/menu"
import {setupStorageSync} from "./setup/app/storage"
import {setupTrayOpenDaily} from "./setup/app/trayOpenDaily"
import {setupTrayVisibility} from "./setup/app/trayVisibility"
import {setupUpdateManager} from "./setup/app/updates"
import {setupMainWindowStatePersistence} from "./setup/app/windowState"
import {setupAboutIPC} from "./setup/ipc/about"
import {setupAiIPC} from "./setup/ipc/ai"
import {setupAssistantIPC} from "./setup/ipc/assistant"
import {setupSettingsIPC} from "./setup/ipc/settings"
import {setupShellIPC} from "./setup/ipc/shell"
import {setupStorageIPC} from "./setup/ipc/storage"
import {setupSyncProviderIPC} from "./setup/ipc/syncProvider"
import {setupSyncServerIPC} from "./setup/ipc/syncServer"
import {setupTaskTimersIPC} from "./setup/ipc/taskTimers"
import {createToastRouter} from "./setup/ipc/toast"
import {setupUpdatesIPC} from "./setup/ipc/updates"
import {setupMainWindowIPC, trackMainWindowVisibility} from "./setup/ipc/windows"
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
}

const windows: AppWindows = {
  main: null,
  splash: null,
  about: null,
  settings: null,
  assistant: null,
}
let storage: StorageController | null = null
let ai: AIController | null = null
let taskTimers: TaskTimersController | null = null
let savedMainWindowState: MainWindowSettings | undefined
let trayVisibility: ReturnType<typeof setupTrayVisibility> | null = null

const toastRouter = createToastRouter()

bootDaily()

function bootDaily() {
  setFileCoordinatorBinaryPath(electronPaths.fileCoordinatorPath())

  setupPrivilegedSchemes()
  setupAppBoot()
  setupDockIcon()
  setupWindowAllClosedHandler()

  setupInstanceAndDeepLinks(
    () => storage,
    () => windows.main,
    {registerProtocol: !IS_DEMO},
  )

  setupActivateHandler(
    () => storage,
    () => windows.main,
    () => setupMainWindow(windows),
  )

  app.whenReady().then(startDaily)

  app.on("before-quit", async (event) => {
    if (taskTimers?.holdQuit(event, () => app.quit())) return
    storage?.stopSync()
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
      if (event.type === "turn_finished") toastRouter.publish({type: "success", message: "AI response ready"})

      const target = windows.assistant ?? windows.main
      target?.webContents.send("ai:event", event)
    },
  )

  try {
    await storage.init()
    if (IS_DEMO) await seedDemoStorage(storage)
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

  setupSafeFileProtocol(storage)
  setupCSP()

  setupShellIPC()
  setupMainWindowIPC(() => windows.main)
  setupUpdatesIPC(() => windows.main)
  toastRouter.registerIPC()

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
  taskTimers = new TaskTimersController(
    storage,
    (timers) => {
      const main = windows.main
      if (!main || main.isDestroyed() || main.webContents.isDestroyed()) return

      try {
        main.webContents.send("task-timers:changed", timers)
      } catch (error) {
        logger.warn(logger.CONTEXT.TASKS, "Failed to publish task timers", error)
      }
    },
    (error) => {
      logger.error(logger.CONTEXT.TASKS, "Failed to save task timer time", error)
      toastRouter.publish({type: "error", message: "Couldn't save timer time. Try stopping the timer again."})
    },
  )
  setupTaskTimersIPC(taskTimers)
  powerMonitor.on("suspend", () => taskTimers?.pauseAll())
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
    (...broadcast) => {
      if (broadcast[0] === "storage:changed") taskTimers?.applyStorageChange(broadcast[1])
      if (broadcast[0] !== "settings:changed") return
      void trayVisibility?.apply()
    },
  )

  if (!IS_DEMO) {
    setupTrayOpenDaily(
      trayController,
      () => windows.main,
      () => setupMainWindow(windows),
    )
    trayVisibility = setupTrayVisibility(trayController, () => storage)
    await trayVisibility.apply()
  }

  setupMainWindow(windows, {showSplash: true})

  if (!IS_DEMO)
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
  toastRouter.trackMainWindow(main)
  trackMainWindowVisibility(main)
  const rendererReady = waitForRendererReady(() => windows.main)
  if (storage && !IS_DEMO) setupUpdateManager(main, () => storage)

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
  })

  return main
}
