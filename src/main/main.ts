import path, {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {app, BrowserWindow, nativeImage, protocol, session} from "electron"
import fs from "fs-extra"

import {cleanupOrphanAssets, focusWindow, getMimeType, sleep} from "./helpers.js"
import {setupMenuIPC} from "./ipc/menu.js"
import {setupStorageIPC} from "./ipc/storage.js"
import {setupMainWindowIPC} from "./ipc/window.js"
import {createMenu} from "./menu/menu.js"
import {handleDeepLink, setupDeepLinks} from "./services/deep-links.js"
import {StorageManager} from "./services/storage-manager.js"
import {setupUpdateManager} from "./services/updater.js"
import {createMainWindow} from "./windows/main-window.js"
import {createSplashWindow} from "./windows/splash-window.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

let storage: StorageManager
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      focusWindow(mainWindow)
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
  protocol.handle("safe-file", async (request) => {
    const url = request.url.replace("safe-file://", "")
    const filePath = path.join(storage.assetsDir, decodeURIComponent(url))

    try {
      const data = await fs.readFile(filePath)
      const extension = path.extname(filePath).slice(1)
      const mime = getMimeType(extension)

      return new Response(data as any, {headers: {"Content-Type": mime}})
    } catch (e) {
      console.error("❌ Failed to load asset:", filePath, e)
      return new Response("Not Found", {status: 404})
    }
  })

  splashWindow = createSplashWindow()

  storage = new StorageManager()
  try {
    await storage.init()
    await cleanupOrphanAssets(storage)
    const info = await storage.getStorageInfo()
    console.log(`✅ Storage initialized: ${info.tasksCount} tasks, ${info.daysCount} days`)
  } catch (err) {
    console.error("❌ Failed to initialize storage:", err)
    app.quit()
    return
  }
  setupStorageIPC(storage)

  mainWindow = createMainWindow()
  setupMainWindowIPC(mainWindow)
  setupMenuIPC(mainWindow)
  createMenu(mainWindow)
  setupDeepLinks(mainWindow)
  setupUpdateManager(mainWindow)

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

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow()
    setupMainWindowIPC(mainWindow)
    setupMenuIPC(mainWindow)
    createMenu(mainWindow)
    setupDeepLinks(mainWindow)
    mainWindow.once("ready-to-show", () => {
      mainWindow!.show()
      focusWindow(mainWindow!)
    })
  } else if (mainWindow) {
    focusWindow(mainWindow)
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
