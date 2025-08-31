import path, {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {app} from "electron"

const __dirname = dirname(fileURLToPath(import.meta.url))

export const META_FILE = ".meta.json"
export const CONFIG_FILE = ".config.json"
export const ASSETS_DIR = "assets"
export const INTERNAL_SETTINGS_FILE = "settings.json"

export const APP_CONFIG = {
  name: "Daily",
  protocol: "daily",
  window: {
    main: {
      width: 1200,
      minWidth: 610,
      height: 800,
      minHeight: 680,
    },
    splash: {
      width: 400,
      height: 300,
      resizable: false,
    },
    timer: {
      width: 300,
      height: 280,
      resizable: false,
    },
  },
  csp: {
    policy:
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ` +
      `img-src 'self' data: blob: https: file: temp: safe-file:; font-src 'self' data:; ` +
      `connect-src 'self' https://api.github.com https://github.com; frame-src 'none'; object-src 'none';`,
  },
} as const

export const ENV = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
  disableFocusSync: process.env.DISABLE_FOCUS_SYNC === "true",
} as const

export const PATHS = {
  get icon() {
    return ENV.isDevelopment ? join(__dirname, "static", "icon.png") : join(app.getAppPath(), "static", "icon.png")
  },
  get preload() {
    return ENV.isDevelopment ? join(process.cwd(), "build", "main", "preload.cjs") : join(app.getAppPath(), "main", "preload.cjs")
  },
  get renderer() {
    const rendererPort = process.argv[2]
    return ENV.isDevelopment ? `http://localhost:${rendererPort}` : join(app.getAppPath(), "renderer", "index.html")
  },
} as const

/**
 * Utility functions to resolve storage file and directory paths under a given root.
 */
export const fsPaths = {
  internalSettingsPath: () => path.join(app.getPath("userData"), INTERNAL_SETTINGS_FILE),
  defaultPath: () => path.join(app.getPath("documents"), "Daily"),

  metaFile: (rootDir: string) => path.join(rootDir, META_FILE),
  configFile: (rootDir: string) => path.join(rootDir, CONFIG_FILE),
  assetsDir: (rootDir: string) => path.join(rootDir, ASSETS_DIR),
  dayFolder: (rootDir: string, date: string) => path.join(rootDir, date),
  taskFile: (rootDir: string, relativePath: string) => path.join(rootDir, relativePath),
}
