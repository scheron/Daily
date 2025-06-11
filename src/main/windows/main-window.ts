import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {app, BrowserWindow, shell} from "electron"

const __dirname = dirname(fileURLToPath(import.meta.url))

function getIconPath(): string {
  if (process.env.NODE_ENV === "development") {
    return join(__dirname, "..", "static", "icon.png")
  }

  return join(app.getAppPath(), "static", "icon.png")
}

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    minWidth: 500,
    height: 800,
    minHeight: 680,
    center: true,
    title: "Daily",
    transparent: true,
    frame: false,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: getIconPath(),
    webPreferences: {
      preload:
        process.env.NODE_ENV === "development" ? join(process.cwd(), "build", "main", "preload.cjs") : join(app.getAppPath(), "main", "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })

  if (process.env.NODE_ENV === "development") {
    const rendererPort = process.argv[2]
    mainWindow.loadURL(`http://localhost:${rendererPort}`)
  } else {
    mainWindow.loadFile(join(app.getAppPath(), "renderer", "index.html"))
  }

  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    shell.openExternal(url)
    return {action: "deny"}
  })

  return mainWindow
}
