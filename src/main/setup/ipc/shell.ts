import {existsSync} from "node:fs"
import {chmod, lstat, mkdir, readFile, readlink, rename, writeFile} from "node:fs/promises"
import {homedir} from "node:os"
import path from "node:path"
import {ipcMain, shell} from "electron"

import {CLI_CONFIG} from "@shared/config/cli"
import {logger} from "@/utils/logger"
import {ensurePathEntry, hasPathEntry} from "@/utils/shell/pathEntry"

import type {CliInstallResult, CliInstallState} from "@shared/types/shell"

/**
 * Setup IPC handlers for shell operations
 * Currently handles opening external URLs in the system browser
 */
export function setupShellIPC() {
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    try {
      const urlObj = new URL(url)
      const allowedProtocols = ["http:", "https:", "mailto:"]

      if (!allowedProtocols.includes(urlObj.protocol)) {
        logger.warn(logger.CONTEXT.SHELL, `Blocked attempt to open URL with disallowed protocol: ${url}`)
        return false
      }

      await shell.openExternal(url)
      return true
    } catch (err) {
      logger.error(logger.CONTEXT.SHELL, `Failed to open external URL: ${url}`, err)
      return false
    }
  })

  ipcMain.handle("shell:get-cli-install-state", async () => {
    return getCliInstallState()
  })

  ipcMain.handle("shell:install-cli", async () => {
    return installCli()
  })

  ipcMain.handle("shell:configure-cli-path", async () => {
    return configureCliPath()
  })
}

async function installCli(): Promise<CliInstallResult> {
  const state = await getCliInstallState()

  if (!state.available) {
    return {ok: false, state, error: "CLI launcher is not available in this build"}
  }

  if (state.conflict) {
    return {ok: false, state, error: `${state.binPath} already exists and is not managed by Daily`}
  }

  try {
    await mkdir(state.binDir, {recursive: true})
    const tempPath = `${state.binPath}.tmp-${process.pid}`
    await writeFile(tempPath, buildUserLauncher(state.launcherPath), {mode: 0o755})
    await chmod(tempPath, 0o755)
    await rename(tempPath, state.binPath)
    return {ok: true, state: await getCliInstallState()}
  } catch (err) {
    logger.error(logger.CONTEXT.SHELL, "Failed to install CLI launcher", err)
    return {ok: false, state: await getCliInstallState(), error: err instanceof Error ? err.message : String(err)}
  }
}

async function configureCliPath(): Promise<CliInstallResult> {
  const state = await getCliInstallState()

  if (!state.installed) {
    return {ok: false, state, error: "Install the CLI first"}
  }

  try {
    await ensurePathEntry(state.shellProfilePath, state.binDir, homedir())
    return {ok: true, state: await getCliInstallState()}
  } catch (err) {
    logger.error(logger.CONTEXT.SHELL, "Failed to configure CLI PATH", err)
    return {ok: false, state: await getCliInstallState(), error: err instanceof Error ? err.message : String(err)}
  }
}

async function getCliInstallState(): Promise<CliInstallState> {
  const binDir = path.join(homedir(), ".local", "bin")
  const binPath = path.join(binDir, CLI_CONFIG.name)
  const shellProfilePath = path.join(homedir(), ".zshrc")
  const launcherPath = path.join(process.resourcesPath, CLI_CONFIG.name)
  const available = existsSync(launcherPath)
  const installed = await isManagedCliInstall(binPath, launcherPath)
  const exists = await pathExists(binPath)
  const shellProfileIncludesBin = await profileHasPathEntry(shellProfilePath, binDir)

  return {
    available,
    installed,
    binPath,
    binDir,
    launcherPath,
    shellProfilePath,
    pathIncludesBin: (process.env.PATH ?? "").split(path.delimiter).includes(binDir),
    shellProfileIncludesBin,
    pathHint: `export PATH="${binDir}:$PATH"`,
    conflict: exists && !installed,
  }
}

async function profileHasPathEntry(profilePath: string, binDir: string): Promise<boolean> {
  try {
    return hasPathEntry(await readFile(profilePath, "utf8"), binDir, homedir())
  } catch {
    return false
  }
}

async function isManagedCliInstall(binPath: string, launcherPath: string): Promise<boolean> {
  try {
    const stat = await lstat(binPath)
    if (stat.isSymbolicLink()) {
      return (await readlink(binPath)) === launcherPath
    }
    if (!stat.isFile()) return false
    const content = await readFile(binPath, "utf8")
    return content.includes(CLI_CONFIG.managedMarker) && content.includes(launcherPath)
  } catch {
    return false
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath)
    return true
  } catch {
    return false
  }
}

function buildUserLauncher(launcherPath: string): string {
  return `#!/bin/sh
${CLI_CONFIG.managedMarker}
exec ${shellQuote(launcherPath)} "$@"
`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
