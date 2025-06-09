import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {app, BrowserWindow, nativeImage, session} from "electron"

import {setupMenuIPC} from "./ipc/menu.js"
import {setupStorageIPC} from "./ipc/storage.js"
import {setupMainWindowIPC} from "./ipc/window.js"
import {createMenu} from "./menu/menu.js"
import {setupDeepLinks} from "./services/deep-links.js"
import {StorageManager} from "./services/storage-manager.js"
import {createMainWindow} from "./windows/main-window.js"
import {createSplashWindow} from "./windows/splash-window.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

let storage: StorageManager | null = null
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

app.setName("Daily")

if (process.platform === "darwin") {
  try {
    if (app.dock) app.dock.setIcon(getIconPath())
  } catch (error) {
    console.warn("Failed to set dock icon:", error)
  }
}

app.whenReady().then(initializeApp)

app.on("activate", () => !BrowserWindow.getAllWindows().length && initializeApp())
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit())

async function initializeStorage(): Promise<void> {
  console.log("🔄 Initializing storage...")

  try {
    storage = new StorageManager()
    await storage.init()

    const info = await storage.getStorageInfo()
    console.log(`✅ Storage initialized: ${info.tasksCount} tasks, ${info.daysCount} days`)
  } catch (error) {
    console.error("❌ Failed to initialize storage:", error)
    throw error
  }
}

async function initializeApp(): Promise<void> {
  splashWindow = createSplashWindow()

  try {
    await Promise.all([initializeStorage(), new Promise((resolve) => setTimeout(resolve, 1000))])

    mainWindow = createMainWindow()

    setupMainWindowIPC(mainWindow)
    setupMenuIPC(mainWindow)
    setupStorageIPC(storage!)

    mainWindow.once("ready-to-show", () => {
      if (splashWindow) {
        splashWindow.close()
        splashWindow = null
      }
      mainWindow?.show()
      console.log("✅ Main window displayed")
    })

    createMenu(mainWindow)
    setupDeepLinks(mainWindow)

    if (process.platform === "darwin") {
      try {
        const icon = nativeImage.createFromPath(getIconPath())
        if (app.dock) app.dock.setIcon(icon)
      } catch (error) {
        console.warn("Failed to set dock icon:", error)
      }
    }

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; " +
              "script-src 'self'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob: https:; " +
              "font-src 'self' data:; " +
              "connect-src 'self' https://api.github.com https://github.com; " +
              "frame-src 'none'; " +
              "object-src 'none';",
          ],
        },
      })
    })
  } catch (error) {
    console.error("❌ Failed to initialize app:", error)

    if (splashWindow) {
      splashWindow.close()
      splashWindow = null
    }

    app.quit()
  }
}

function getIconPath(): string {
  return process.env.NODE_ENV === "development" ? join(__dirname, "static", "icon.png") : join(app.getAppPath(), "static", "icon.png")
}
