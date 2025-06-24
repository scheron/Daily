import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {app, BrowserWindow, nativeImage, protocol, session} from "electron"

import type {StorageManager} from "./types.js"

import {cleanupOrphanAssets, focusWindow, sleep} from "./helpers.js"
import {setupMenuIPC} from "./ipc/menu.js"
import {setupStorageIPC} from "./ipc/storage.js"
import {setupMainWindowIPC} from "./ipc/window.js"
import {setupMenu} from "./menu/menu.js"
import {handleDeepLink, setupDeepLinks} from "./services/deep-links.js"
import {notifyStorageSyncStatus, setupStorageEvents, syncStorage} from "./services/storage-events.js"
import {FileStorageManager} from "./services/storage-manager.js"
import {setupUpdateManager} from "./services/updater.js"
import {createMainWindow} from "./windows/main-window.js"
import {createSplashWindow} from "./windows/splash-window.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

let storage: StorageManager
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

const gotLock = app.requestSingleInstanceLock()

const DISABLE_FOCUS_SYNC = process.env.DISABLE_FOCUS_SYNC === "true"

if (!gotLock) {
  app.quit()
} else {
  app.on("second-instance", async (_event, argv) => {
    if (mainWindow) {
      focusWindow(mainWindow)
      if (!DISABLE_FOCUS_SYNC) {
        try {
          notifyStorageSyncStatus(true)
          await storage.syncStorage()
          console.log("🔄 Storage revalidated on second-instance")
        } catch (err) {
          console.warn("⚠️ Failed to revalidate storage on second-instance:", err)
        } finally {
          notifyStorageSyncStatus(false)
        }
      }
    }
    const url = argv.find((arg) => arg.startsWith("daily://"))
    if (url) handleDeepLink(url, mainWindow!)
  })

  app.setAsDefaultProtocolClient("daily")

  app.on("open-url", (event, url) => {
    event.preventDefault()
    handleDeepLink(url, mainWindow!)
  })
}

app.setName("Daily")

if (process.platform === "darwin" && app.dock) {
  try {
    app.dock.setIcon(nativeImage.createFromPath(getIconPath()))
  } catch (error) {
    console.warn("Failed to set dock icon:", error)
  }
}

app.whenReady().then(async () => {
  splashWindow = createSplashWindow()

  storage = new FileStorageManager()
  try {
    await storage.init()
    await cleanupOrphanAssets(storage)
    console.log(`✅ Storage initialized`)
  } catch (err) {
    console.error("❌ Failed to initialize storage:", err)
    app.quit()
    return
  }

  setupStorageIPC(storage)

  mainWindow = createMainWindow()

  setupMainWindowIPC(mainWindow)
  setupMenuIPC(mainWindow)
  setupMenu(mainWindow)

  setupDeepLinks(mainWindow)
  setupUpdateManager(mainWindow)
  setupStorageEvents(() => mainWindow)

  protocol.handle("safe-file", async (request) => {
    const url = request.url.replace("safe-file://", "")
    return storage.getAssetResponse(url)
  })

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

  mainWindow.on("focus", () => syncStorage(storage))

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ` +
            `img-src 'self' data: blob: https: file: temp: safe-file:; font-src 'self' data:; ` +
            `connect-src 'self' https://api.github.com https://github.com; frame-src 'none'; object-src 'none';`,
        ],
      },
    })
  })

  const urlArg = process.argv.find((arg) => arg.startsWith("daily://"))
  if (urlArg) {
    setTimeout(() => handleDeepLink(urlArg, mainWindow!), 1000)
  }
})

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow()
    setupMainWindowIPC(mainWindow)
    setupMenuIPC(mainWindow)
    setupMenu(mainWindow)
    setupDeepLinks(mainWindow)
    setupStorageEvents(() => mainWindow)

    mainWindow.once("ready-to-show", () => {
      mainWindow!.show()
      focusWindow(mainWindow!)
    })
  } else if (mainWindow) {
    focusWindow(mainWindow)
    console.log("🔄 Storage revalidated on activate")

    if (!DISABLE_FOCUS_SYNC) {
      try {
        notifyStorageSyncStatus(true)
        await storage.syncStorage()
        console.log("🔄 Storage revalidated on activate")
      } catch (err) {
        console.warn("⚠️ Failed to revalidate storage on activate:", err)
      } finally {
        notifyStorageSyncStatus(false)
      }
    }
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

function getIconPath(): string {
  return process.env.NODE_ENV === "development" ? join(__dirname, "static", "icon.png") : join(app.getAppPath(), "static", "icon.png")
}
