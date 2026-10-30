import path, {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

import {dataPaths, ENV} from "@daily/core"
import {APP_CONFIG} from "@daily/protocol"

import {IS_DEMO, resolveAppProfile} from "@main/demo/profile"

import type {AppPaths} from "@daily/core"

type ElectronApp = {
  getAppPath(): string
  getPath(name: "userData" | "documents"): string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const profile = resolveAppProfile(IS_DEMO, ENV.isDevelopment)

/**
 * Builds the full electron path set over a live `app` instance. The electron
 * import stays in `electronPaths.ts` so this module stays free of it.
 */
export function createElectronPaths(app: ElectronApp, resourcesPath: string) {
  return {
    ...dataPaths(() => app.getPath("userData")),
    icon: () => (ENV.isDevelopment ? join(__dirname, "resources", "icon.png") : join(app.getAppPath(), "resources", "icon.png")),
    trayIcon: () => (ENV.isDevelopment ? join(process.cwd(), "public", "trayTemplate.png") : join(app.getAppPath(), "resources", "trayTemplate.png")),
    preload: () =>
      ENV.isDevelopment
        ? join(process.cwd(), profile.outputDirectory, "preload", "preload.cjs")
        : join(app.getAppPath(), profile.outputDirectory, "preload", "preload.cjs"),
    renderer: () => {
      if (ENV.isDevelopment && process.env.ELECTRON_RENDERER_URL) return process.env.ELECTRON_RENDERER_URL
      return ENV.isDevelopment ? "http://localhost:8080" : join(app.getAppPath(), profile.outputDirectory, "renderer", "index.html")
    },
    exportRootDefault: () => path.join(app.getPath("documents"), `${IS_DEMO ? profile.dataDirectory : APP_CONFIG.name}-Exports`),
    remoteSyncPath,
    remoteSyncAssetsPath: () => path.join(remoteSyncPath(), "assets"),
    modelsPath: () => path.join(app.getPath("userData"), "models"),
    binPath: () => path.join(app.getPath("userData"), "bin"),
    updatesPath: () => path.join(app.getPath("userData"), "updates"),
    updatesReleasesPath: () => path.join(app.getPath("userData"), "updates", "releases"),
    updatesInstallResultPath: () => path.join(app.getPath("userData"), "updates", "install-result.json"),
    updatesInstallFailurePath: () => path.join(app.getPath("userData"), "updates", "install-failure.json"),
    updatesInstallLogPath: () => path.join(app.getPath("userData"), "updates", "install.log"),
    modelsCatalogPath: () => (ENV.isDevelopment ? join(process.cwd(), "resources", "models.json") : join(resourcesPath, "models.json")),
    modelsCatalogCachePath: () => path.join(app.getPath("userData"), "models-catalog.json"),
  } satisfies AppPaths & Record<string, () => string>
}

function remoteSyncPath(): string {
  const iCloudRoot = `${process.env.HOME}/Library/Mobile Documents/com~apple~CloudDocs`
  return path.join(iCloudRoot, profile.syncDirectory)
}
