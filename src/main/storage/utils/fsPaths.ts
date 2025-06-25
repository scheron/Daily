import path from "node:path"
import {app} from "electron"

export const META_FILE = ".meta.json"
export const CONFIG_FILE = ".config.json"
export const ASSETS_DIR = "assets"
export const INTERNAL_SETTINGS_FILE = "settings.json"

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
