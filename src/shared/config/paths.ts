import path, {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

import {CLI_MUTATION_SIGNAL_FILE} from "../constants/storage"
import {APP_CONFIG} from "./app"
import {ENV} from "./env"

/** The subset of filesystem paths the storage core consumes. Implemented by electronPaths (app) and cliPaths (cli). */
export type AppPaths = {
  /** Runtime data root, e.g. ~/Library/Application Support/Daily */
  appDataRoot(): string
  /** SQLite database file. */
  dbPath(): string
  /** Local binary assets directory. */
  assetsDir(): string
  /** iCloud remote-sync directory. */
  remoteSyncPath(): string
  /** Local-only marker file an external writer touches to signal the running app. */
  mutationSignalPath(): string
}

type ElectronApp = {
  getAppPath(): string
  getPath(name: "userData" | "documents"): string
}

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Builds the full electron path set over a live `app` instance. The electron
 * import stays in main's runtime glue so this module remains loadable by the CLI.
 */
export function createElectronPaths(app: ElectronApp, resourcesPath: string) {
  return {
    ...dataPaths(() => app.getPath("userData")),
    icon: () => (ENV.isDevelopment ? join(__dirname, "resources", "icon.png") : join(app.getAppPath(), "resources", "icon.png")),
    preload: () =>
      ENV.isDevelopment ? join(process.cwd(), "out", "preload", "preload.cjs") : join(app.getAppPath(), "out", "preload", "preload.cjs"),
    renderer: () => {
      if (ENV.isDevelopment && process.env.ELECTRON_RENDERER_URL) return process.env.ELECTRON_RENDERER_URL
      return ENV.isDevelopment ? "http://localhost:8080" : join(app.getAppPath(), "out", "renderer", "index.html")
    },
    exportRootDefault: () => path.join(app.getPath("documents"), `${APP_CONFIG.name}-Exports`),
    remoteSyncPath,
    remoteSyncAssetsPath: () => path.join(remoteSyncPath(), "assets"),
    modelsPath: () => path.join(app.getPath("userData"), "models"),
    binPath: () => path.join(app.getPath("userData"), "bin"),
    updatesPath: () => path.join(app.getPath("userData"), "updates"),
    updatesReleasesPath: () => path.join(app.getPath("userData"), "updates", "releases"),
    updatesInstallResultPath: () => path.join(app.getPath("userData"), "updates", "install-result.json"),
    modelsCatalogPath: () => (ENV.isDevelopment ? join(process.cwd(), "resources", "models.json") : join(resourcesPath, "models.json")),
    modelsCatalogCachePath: () => path.join(app.getPath("userData"), "models-catalog.json"),
  } satisfies AppPaths & Record<string, () => string>
}

/** Electron-free path set for the CLI: same data layout resolved from $HOME instead of the electron app. */
export const cliPaths: AppPaths = {
  ...dataPaths(() => path.join(process.env.HOME ?? "", "Library", "Application Support", APP_CONFIG.name)),
  remoteSyncPath,
}

/**
 * Electron-free path set for a standalone CLI node (no app installed):
 * XDG data layout. remoteSyncPath is unused in node mode — the sync folder
 * comes from the CLI config instead — but stays for AppPaths compatibility.
 */
export function createCliNodePaths(): AppPaths {
  const dataRoot = () => path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME ?? "", ".local", "share"), "daily")
  return {...dataPaths(dataRoot), remoteSyncPath}
}

function dataPaths(root: () => string) {
  return {
    appDataRoot: root,
    dbPath: () => path.join(root(), "db", "daily.sqlite"),
    assetsDir: () => path.join(root(), "assets"),
    mutationSignalPath: () => path.join(root(), CLI_MUTATION_SIGNAL_FILE),
  }
}

function remoteSyncPath(): string {
  return path.join(APP_CONFIG.iCloudPath, ENV.isDevelopment ? `${APP_CONFIG.name}-dev` : APP_CONFIG.name)
}
