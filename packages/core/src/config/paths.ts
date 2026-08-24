import path from "node:path"

import {CLI_MUTATION_SIGNAL_FILE} from "@daily/protocol"

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

/** The data-root-derived members every AppPaths implementation shares. */
export function dataPaths(root: () => string): Pick<AppPaths, "appDataRoot" | "dbPath" | "assetsDir" | "mutationSignalPath"> {
  return {
    appDataRoot: root,
    dbPath: () => path.join(root(), "db", "daily.sqlite"),
    assetsDir: () => path.join(root(), "assets"),
    mutationSignalPath: () => path.join(root(), CLI_MUTATION_SIGNAL_FILE),
  }
}
