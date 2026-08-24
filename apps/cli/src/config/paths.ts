import path from "node:path"

import {dataPaths} from "@daily/core"
import {APP_CONFIG} from "@daily/protocol"

import type {AppPaths} from "@daily/core"

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

/** The CLI has no remote-sync path of its own — iCloud is the app's responsibility. Unreachable: nothing in the CLI calls it. */
function remoteSyncPath(): string {
  throw new Error("remoteSyncPath is not available in the CLI — it is the app's responsibility")
}
