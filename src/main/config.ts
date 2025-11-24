import path, {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {app} from "electron"

const __dirname = dirname(fileURLToPath(import.meta.url))

export const APP_CONFIG = {
  name: "Daily",
  protocol: "daily",
  filesProtocol: "daily://file",
  iCloudPath: `${process.env.HOME}/Library/Mobile Documents/com~apple~CloudDocs`,
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
    devTools: {
      width: 1200,
      minWidth: 610,
      height: 800,
      minHeight: 680,
    },
  },
  csp: {
    policy:
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ` +
      `img-src 'self' data: blob: https: file: temp: daily:; font-src 'self' data:; ` +
      `connect-src 'self' https://api.github.com https://github.com; frame-src 'none'; object-src 'none';`,
  },
  privilegedSchemes: [
    {
      scheme: "daily",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        bypassCSP: false,
      },
    },
  ],
} as const

export const ENV = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",

  // Logging configuration - SINGLE TOGGLE
  logging: {
    enabled: process.env.NODE_ENV === "development", // Enable in development only
    minLevel: "INFO" as const, // Show INFO, WARN, ERROR (hide DEBUG)
  },
} as const

/**
 * Utility functions to resolve paths in project.
 */
export const PATHS = {
  get icon() {
    return ENV.isDevelopment ? join(__dirname, "resources", "icon.png") : join(app.getAppPath(), "resources", "icon.png")
  },
  get preload() {
    return ENV.isDevelopment ? join(process.cwd(), "out", "preload", "preload.cjs") : join(app.getAppPath(), "out", "preload", "preload.cjs")
  },
  get renderer() {
    // electron-vite sets ELECTRON_RENDERER_URL environment variable automatically
    return ENV.isDevelopment && process.env.ELECTRON_RENDERER_URL
      ? process.env.ELECTRON_RENDERER_URL
      : ENV.isDevelopment
        ? "http://localhost:8080"
        : join(app.getAppPath(), "out", "renderer", "index.html")
  },
} as const

/**
 * Utility functions to resolve storage file and directory paths.
 */
export const fsPaths = {
  /** Runtime data root: ~/Library/Application Support/Daily */
  appDataRoot: () => app.getPath("userData"),

  /** PouchDB database path */
  dbPath: () => path.join(app.getPath("userData"), "db"),

  /** Default export location for vault exports */
  exportRootDefault: () => path.join(app.getPath("documents"), "Daily-Exports"),

  /** Remote sync directory */
  remoteSyncPath: () => path.join(APP_CONFIG.iCloudPath, "Daily"),
}
