import path from "node:path"
import fs from "fs-extra"

import {cliPaths, createCliNodePaths} from "@shared/config/paths"

import type {AppPaths} from "@shared/config/paths"

export type CliConfig = {sync?: {dir: string}}

export type CliRuntime = {paths: AppPaths; mode: "direct" | "node"; syncDir: string | null}

/** ~/.config/daily/config.json (or $XDG_CONFIG_HOME/daily/config.json). */
export function cliConfigPath(): string {
  const configRoot = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME ?? "", ".config")
  return path.join(configRoot, "daily", "config.json")
}

/** Reads the CLI config; a missing or corrupt file is an empty config. */
export function loadCliConfig(): CliConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(cliConfigPath(), "utf-8"))
    if (typeof parsed !== "object" || parsed === null) return {}
    const dir = (parsed as CliConfig).sync?.dir
    return typeof dir === "string" && dir.length > 0 ? {sync: {dir}} : {}
  } catch {
    return {}
  }
}

/** Writes the CLI config, creating the directory if needed. */
export function saveCliConfig(config: CliConfig): void {
  fs.ensureDirSync(path.dirname(cliConfigPath()))
  fs.writeFileSync(cliConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf-8")
}

/** Default sync folder for `daily sync enable` without --dir. */
export function defaultSyncDir(): string {
  const dataRoot = process.env.XDG_DATA_HOME || path.join(process.env.HOME ?? "", ".local", "share")
  return path.join(dataRoot, "daily", "sync")
}

/**
 * Picks the CLI mode from the config file — explicitly, not by heuristics.
 * No sync section → direct mode over the app's database (current behavior).
 * sync.dir set → node mode: own XDG-located database synced with that folder.
 */
export function resolveCliRuntime(): CliRuntime {
  const config = loadCliConfig()
  if (config.sync?.dir) return {paths: createCliNodePaths(), mode: "node", syncDir: config.sync.dir}
  return {paths: cliPaths, mode: "direct", syncDir: null}
}
