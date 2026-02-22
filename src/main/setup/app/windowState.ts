import {logger} from "@/utils/logger"

import type {StorageController} from "@/storage/StorageController"
import type {MainWindowSettings} from "@shared/types/storage"
import type {BrowserWindow} from "electron"

export async function loadSavedMainWindowState(storage: StorageController): Promise<MainWindowSettings | undefined> {
  const settings = await storage.loadSettings()
  return settings.window.main
}

export function setupMainWindowStatePersistence(getStorage: () => StorageController | null, getMainWindow: () => BrowserWindow | null): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let lastSavedStateJson = ""

  const persistState = async () => {
    const storage = getStorage()
    if (!storage || !mainWindow || mainWindow.isDestroyed()) return

    const state = getCurrentMainWindowState(mainWindow)
    const stateJson = JSON.stringify(state)
    if (stateJson === lastSavedStateJson) return

    lastSavedStateJson = stateJson

    try {
      await storage.saveSettings({
        window: {
          main: state,
        },
      })
    } catch (error) {
      logger.warn(logger.CONTEXT.APP, "Failed to persist main window state", error)
    }
  }

  const schedulePersist = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      persistState()
    }, 250)
  }

  const mainWindow = getMainWindow()
  if (!mainWindow) return

  mainWindow.on("move", schedulePersist)
  mainWindow.on("resize", schedulePersist)
  mainWindow.on("maximize", schedulePersist)
  mainWindow.on("unmaximize", schedulePersist)
  mainWindow.on("enter-full-screen", schedulePersist)
  mainWindow.on("leave-full-screen", schedulePersist)
  mainWindow.on("close", () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    persistState()
  })
}

function getCurrentMainWindowState(mainWindow: BrowserWindow): MainWindowSettings {
  const isMaximized = mainWindow.isMaximized()
  const isFullScreen = mainWindow.isFullScreen()
  const bounds = isMaximized || isFullScreen ? mainWindow.getNormalBounds() : mainWindow.getBounds()

  return {
    width: bounds.width,
    height: bounds.height,
    isMaximized,
    isFullScreen,
  }
}
