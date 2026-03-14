import path, {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {app} from "electron"

import type {LogContext} from "@/types/logger"

const __dirname = dirname(fileURLToPath(import.meta.url))

export const APP_CONFIG = {
  name: "Daily",
  author: "Scheron",
  protocol: "daily",
  filesProtocol: "daily://file",
  iCloudPath: `${process.env.HOME}/Library/Mobile Documents/com~apple~CloudDocs`,

  sync: {
    garbageCollectionInterval: 7 * 24 * 60 * 60 * 1000,
    remoteSyncInterval: 5 * 60 * 1000,
  },
  ai: {
    enabled: false,
    provider: "openai",
    runtime: {
      openAiCompatible: {
        modelsLimitCount: 20,
        connectionTimeoutMs: 10_000,
      },
      local: {
        host: "127.0.0.1",
        apiPath: "/v1",
        apiKey: "no-key",
      },
    },
    openai: {
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
    },
    local: {
      model: "daily-balanced",
    },
  },
  updates: {
    brewCask: "scheron/tap/daily",
    brewTimeoutMs: 15 * 60_000,
    githubRepo: "scheron/Daily",
    brewEnv: {
      HOMEBREW_NO_AUTO_UPDATE: "1",
    },
    githubHeaders: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Daily-App-Updater",
    },
  },
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
    settings: {
      width: 860,
      height: 640,
    },
    assistant: {
      width: 480,
      height: 680,
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

  logging: {
    enabled: process.env.NODE_ENV === "development",
    minLevel: "INFO" as const,
    contexts: [] as LogContext[],
  },
} as const

/**
 * Utility functions to resolve file and directory paths.
 */
export const fsPaths = {
  /** App icon path */
  icon: () => (ENV.isDevelopment ? join(__dirname, "resources", "icon.png") : join(app.getAppPath(), "resources", "icon.png")),

  /** Preload script path */
  preload: () => (ENV.isDevelopment ? join(process.cwd(), "out", "preload", "preload.cjs") : join(app.getAppPath(), "out", "preload", "preload.cjs")),

  /** Renderer URL or file path */
  renderer: () => {
    if (ENV.isDevelopment && process.env.ELECTRON_RENDERER_URL) return process.env.ELECTRON_RENDERER_URL
    return ENV.isDevelopment ? "http://localhost:8080" : join(app.getAppPath(), "out", "renderer", "index.html")
  },

  /** Runtime data root: ~/Library/Application Support/Daily */
  appDataRoot: () => app.getPath("userData"),

  /** SQLite database file path */
  dbPath: () => path.join(app.getPath("userData"), "db", "daily.sqlite"),

  /** Local assets directory */
  assetsDir: () => path.join(app.getPath("userData"), "assets"),

  /** Default export location for vault exports */
  exportRootDefault: () => path.join(app.getPath("documents"), "Daily-Exports"),

  /** Remote sync directory */
  remoteSyncPath: () => path.join(`${app.getPath("home")}/Library/Mobile Documents/com~apple~CloudDocs`, "Daily"),

  /** Remote sync assets directory */
  remoteSyncAssetsPath: () => path.join(fsPaths.remoteSyncPath(), "assets"),

  /** Local AI model files (GGUF) */
  modelsPath: () => path.join(app.getPath("userData"), "models"),

  /** Local AI binary (llama-server) */
  binPath: () => path.join(app.getPath("userData"), "bin"),

  /** Updater working directory */
  updatesPath: () => path.join(app.getPath("userData"), "updates"),

  /** Downloaded update payloads */
  updatesReleasesPath: () => path.join(app.getPath("userData"), "updates", "releases"),

  /** Pending install result marker */
  updatesInstallResultPath: () => path.join(app.getPath("userData"), "updates", "install-result.json"),
}
