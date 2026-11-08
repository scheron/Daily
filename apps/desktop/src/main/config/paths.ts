import path, {join} from "node:path"

import {dataPaths, ENV} from "@daily/core"
import {APP_CONFIG} from "@daily/protocol"

import {IS_DEMO, resolveAppProfile} from "@main/demo/profile"

import type {AppPaths} from "@daily/core"

type ElectronApp = {
  readonly isPackaged: boolean
  getAppPath(): string
  getPath(name: "userData" | "documents"): string
}

const profile = resolveAppProfile(IS_DEMO, ENV.isDevelopment)

export function createElectronPaths(app: ElectronApp, resourcesPath: string) {
  return {
    ...dataPaths(() => app.getPath("userData")),
    icon: () => join(publicDir(), "icon.png"),
    trayIcon: () => join(publicDir(), "trayTemplate.png"),
    fileCoordinatorPath: () => join(extraResourcesDir(), "file-coordinator"),
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
    modelsCatalogPath: () => join(extraResourcesDir(), "models.json"),
    modelsCatalogCachePath: () => path.join(app.getPath("userData"), "models-catalog.json"),
  } satisfies AppPaths & Record<string, () => string>

  function publicDir() {
    return app.isPackaged ? join(app.getAppPath(), "resources") : join(process.cwd(), "public")
  }

  function extraResourcesDir() {
    return app.isPackaged ? resourcesPath : join(process.cwd(), "resources")
  }
}

function remoteSyncPath(): string {
  const iCloudRoot = `${process.env.HOME}/Library/Mobile Documents/com~apple~CloudDocs`
  return path.join(iCloudRoot, profile.syncDirectory)
}
