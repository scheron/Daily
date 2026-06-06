import path from "node:path"
import {app} from "electron"

import type {LogContext} from "@/types/logger"

export const APP_CONFIG = {
  name: "Grammar Diff",
  appId: "com.bmox0.grammar-diff",
  windows: {
    main: {width: 640, height: 420, minHeight: 420},
    settings: {width: 920, height: 660, minWidth: 760, minHeight: 480},
  },
  ai: {
    runtime: {
      local: {
        host: "127.0.0.1",
        apiPath: "/v1",
        apiKey: "local",
      },
    },
  },
} as const

export const Env = {
  isDevelopment: () => process.env.NODE_ENV === "development" || !app.isPackaged,
  isProduction: () => process.env.NODE_ENV === "production",
  logging: {
    enabled: () => process.env.NODE_ENV === "development",
    minLevel: "INFO" as const,
    contexts: [] as LogContext[],
  },
}

export const fsPaths = {
  userData: () => app.getPath("userData"),
  dbPath: () => path.join(app.getPath("userData"), "db", "grammar-diff.sqlite"),
  modelsDir: () => path.join(app.getPath("userData"), "models"),
  binPath: () => path.join(app.getPath("userData"), "bin"),
  modelsCatalogPath: () => {
    const base = app.isPackaged ? path.join(process.resourcesPath, "resources") : path.join(app.getAppPath(), "resources")
    return path.join(base, "models.json")
  },
  preload: () => path.join(__dirname, "../preload/preload.cjs"),
  rendererURL: (route: string) => {
    const base = process.env["ELECTRON_RENDERER_URL"]
    if (Env.isDevelopment() && base) return `${base}/index.html#${route}`
    return `file://${path.join(__dirname, "../renderer/index.html")}#${route}`
  },
}
