import path from "node:path"

/** The subset of filesystem paths the storage core consumes. Implemented by electronPaths. */
export type AppPaths = {
  /** Runtime data root, e.g. ~/Library/Application Support/Daily */
  appDataRoot(): string
  /** SQLite database file. */
  dbPath(): string
  /** Local binary assets directory. */
  assetsDir(): string
  /** iCloud remote-sync directory. */
  remoteSyncPath(): string
}

/** The data-root-derived members every AppPaths implementation shares. */
export function dataPaths(root: () => string): Pick<AppPaths, "appDataRoot" | "dbPath" | "assetsDir"> {
  return {
    appDataRoot: root,
    dbPath: () => path.join(root(), "db", "daily.sqlite"),
    assetsDir: () => path.join(root(), "assets"),
  }
}
