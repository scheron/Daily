import {spawn} from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import {app, dialog} from "electron"

import {logger} from "@/utils/logger"

import type {IStorageController} from "@/types/storage"
import type {AppUpdateCacheState, Settings} from "@shared/types/storage"
import type {BrowserWindow} from "electron"

const BREW_CASK = "scheron/tap/daily"
const BREW_TIMEOUT_MS = 15 * 60_000
const BREW_ENV = {
  HOMEBREW_NO_AUTO_UPDATE: "1",
}

type CaskInfo = {
  version: string
  hash: string | null
}

type ReleaseMeta = CaskInfo & {
  releaseId: string
}

type CommandResult = {
  code: number
  stdout: string
  stderr: string
  didTimeout: boolean
}

let getStorageController: (() => IStorageController | null) | null = null
let isCheckingForUpdate = false
let isPromptOpen = false
let dismissedForSession = false
let resolvedBrewBinary: string | null = null

export function setupUpdateManager(window: BrowserWindow, getStorage: () => IStorageController | null) {
  getStorageController = getStorage

  if (!app.isPackaged || process.platform !== "darwin") return

  if (window.isVisible()) {
    void checkForUpdate(window, false)
    return
  }

  window.once("ready-to-show", () => {
    void checkForUpdate(window, false)
  })
}

export async function checkForUpdate(window: BrowserWindow, manual = true): Promise<void> {
  if (!app.isPackaged || process.platform !== "darwin") {
    if (manual) {
      await dialog.showMessageBox(window, {
        type: "info",
        title: "Updates Unavailable",
        message: "Automatic updates are available only in packaged macOS builds.",
        buttons: ["OK"],
      })
    }
    return
  }

  if (isCheckingForUpdate) {
    if (manual) {
      await dialog.showMessageBox(window, {
        type: "info",
        title: "Update Check",
        message: "An update check is already in progress.",
        buttons: ["OK"],
      })
    }
    return
  }

  isCheckingForUpdate = true

  try {
    const brewBinary = await resolveBrewBinary()
    if (!brewBinary) {
      if (manual) {
        await dialog.showMessageBox(window, {
          type: "warning",
          title: "Homebrew Not Found",
          message: "Homebrew is required for updates but was not found on this Mac.",
          detail: "Install Homebrew and install Daily via cask to use in-app updates.",
          buttons: ["OK"],
        })
      }
      return
    }

    const hasBrewInstall = await isCaskInstalled(brewBinary)
    if (!hasBrewInstall) {
      if (manual) {
        await dialog.showMessageBox(window, {
          type: "warning",
          title: "Brew Install Not Detected",
          message: "Daily is not installed as a Homebrew cask on this machine.",
          detail: "Auto-update works only for brew installations.",
          buttons: ["OK"],
        })
      }
      return
    }

    logger.debug(logger.CONTEXT.APP, `Checking for updates (current: ${app.getVersion()})`)

    const isOutdated = await isCaskOutdated(brewBinary)
    if (!isOutdated) {
      await clearCachedUpdateState()

      if (manual) {
        await dialog.showMessageBox(window, {
          type: "info",
          title: "No Updates",
          message: "You're already using the latest version.",
          buttons: ["OK"],
        })
      }
      return
    }

    const release = await getReleaseMeta(brewBinary)
    if (!release) {
      if (manual) {
        dialog.showErrorBox("Update Check Failed", "Failed to read cask metadata from Homebrew.")
      }
      return
    }

    const settings = await loadSettingsSafe()

    if (!manual && settings?.updates.skippedReleaseId === release.releaseId) {
      logger.info(logger.CONTEXT.APP, `Skipping prompt for ignored release ${release.releaseId}`)
      return
    }

    let cachedUpdate = settings?.updates.cached ?? null
    const hasMatchingCache = isMatchingCachedRelease(cachedUpdate, release)

    if (!hasMatchingCache) {
      const downloaded = await downloadRelease(brewBinary, release)
      if (!downloaded) {
        if (manual) dialog.showErrorBox("Update Download Failed", "Failed to download update using Homebrew.")
        return
      }

      cachedUpdate = downloaded
      await saveUpdatesPatch({cached: downloaded})
    }

    if (!cachedUpdate) return

    await maybeShowUpdatePrompt(window, release, cachedUpdate, manual)
  } catch (error: any) {
    logger.error(logger.CONTEXT.APP, "Update manager failed", error)
    if (manual) dialog.showErrorBox("Update Check Failed", error?.message ?? "Unknown error")
  } finally {
    isCheckingForUpdate = false
  }
}

async function maybeShowUpdatePrompt(window: BrowserWindow, release: ReleaseMeta, cachedUpdate: AppUpdateCacheState, manual: boolean): Promise<void> {
  if (!manual && dismissedForSession) return
  if (isPromptOpen) return

  isPromptOpen = true
  try {
    const detailParts = [
      `Version: ${release.version}`,
      release.hash ? `Hash: ${release.hash}` : null,
      cachedUpdate.cachePath ? `Downloaded to: ${cachedUpdate.cachePath}` : "Downloaded to Homebrew cache.",
    ].filter(Boolean)

    const {response} = await dialog.showMessageBox(window, {
      type: "info",
      title: "Update Ready",
      message: "A new Daily update has been downloaded.",
      detail: detailParts.join("\n"),
      buttons: ["Install and Restart", "Later", "Skip This Version"],
      defaultId: 0,
      cancelId: 1,
    })

    if (response === 0) {
      await installDownloadedRelease(release)
      return
    }

    dismissedForSession = true

    if (response === 2) {
      await saveUpdatesPatch({skippedReleaseId: release.releaseId})
    }
  } finally {
    isPromptOpen = false
  }
}

async function installDownloadedRelease(release: ReleaseMeta): Promise<void> {
  const brewBinary = await resolveBrewBinary()
  if (!brewBinary) {
    dialog.showErrorBox("Install Failed", "Homebrew is not available.")
    return
  }

  logger.info(logger.CONTEXT.APP, `Installing update ${release.version} (${release.releaseId})`)

  const result = await runCommand(brewBinary, ["upgrade", "--cask", BREW_CASK], BREW_TIMEOUT_MS)
  if (result.code !== 0) {
    logger.error(logger.CONTEXT.APP, "brew upgrade failed", {stdout: result.stdout, stderr: result.stderr})
    dialog.showErrorBox("Install Failed", result.stderr || result.stdout || "brew upgrade failed")
    return
  }

  await saveUpdatesPatch({
    skippedReleaseId: null,
    cached: null,
  })

  app.relaunch()
  app.exit(0)
}

async function downloadRelease(brewBinary: string, release: ReleaseMeta): Promise<AppUpdateCacheState | null> {
  logger.info(logger.CONTEXT.APP, `Downloading update ${release.version} in background`)

  const result = await runCommand(brewBinary, ["fetch", "--cask", BREW_CASK], BREW_TIMEOUT_MS)
  if (result.code !== 0) {
    logger.error(logger.CONTEXT.APP, "brew fetch failed", {stdout: result.stdout, stderr: result.stderr})
    return null
  }

  const cachePath = await getBrewCachePath(brewBinary)

  return {
    releaseId: release.releaseId,
    version: release.version,
    hash: release.hash,
    cachePath,
    downloadedAt: new Date().toISOString(),
  }
}

async function resolveBrewBinary(): Promise<string | null> {
  if (resolvedBrewBinary) return resolvedBrewBinary

  const candidates = [
    process.env.HOMEBREW_PREFIX ? path.join(process.env.HOMEBREW_PREFIX, "bin", "brew") : null,
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    "brew",
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (candidate !== "brew" && !fs.existsSync(candidate)) continue

    const check = await runCommand(candidate, ["--version"], 15_000)
    if (check.code === 0) {
      resolvedBrewBinary = candidate
      return candidate
    }
  }

  return null
}

async function isCaskInstalled(brewBinary: string): Promise<boolean> {
  const result = await runCommand(brewBinary, ["list", "--cask", BREW_CASK], 20_000)
  return result.code === 0
}

async function isCaskOutdated(brewBinary: string): Promise<boolean> {
  const result = await runCommand(brewBinary, ["outdated", "--cask", "--json=v2", BREW_CASK], 30_000)
  if (result.code !== 0) {
    logger.warn(logger.CONTEXT.APP, "Unable to check brew outdated state, assuming no update")
    return false
  }

  const parsed = parseJsonSafe<{casks?: unknown[]}>(result.stdout)
  return Array.isArray(parsed?.casks) && parsed.casks.length > 0
}

async function getReleaseMeta(brewBinary: string): Promise<ReleaseMeta | null> {
  const result = await runCommand(brewBinary, ["info", "--cask", "--json=v2", BREW_CASK], 30_000)
  if (result.code !== 0) {
    logger.error(logger.CONTEXT.APP, "brew info failed", {stdout: result.stdout, stderr: result.stderr})
    return null
  }

  const parsed = parseJsonSafe<{casks?: Array<{version?: string; sha256?: unknown}>}>(result.stdout)
  const cask = parsed?.casks?.[0]
  const version = cask?.version
  if (!version) return null

  const hash = normalizeSha256(cask?.sha256)
  const releaseId = hash ? `${version}:${hash}` : version

  return {version, hash, releaseId}
}

function normalizeSha256(raw: unknown): string | null {
  if (typeof raw === "string") {
    return raw === "no_check" ? null : raw
  }

  if (raw && typeof raw === "object") {
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (typeof value === "string" && value !== "no_check") {
        return value
      }
    }
  }

  return null
}

async function getBrewCachePath(brewBinary: string): Promise<string | null> {
  const result = await runCommand(brewBinary, ["--cache", "--cask", BREW_CASK], 15_000)
  if (result.code !== 0) return null

  const cachePath = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)

  if (!cachePath) return null

  return fs.existsSync(cachePath) ? cachePath : null
}

function isMatchingCachedRelease(cached: AppUpdateCacheState | null, release: ReleaseMeta): cached is AppUpdateCacheState {
  return Boolean(cached && cached.releaseId === release.releaseId)
}

async function clearCachedUpdateState(): Promise<void> {
  const settings = await loadSettingsSafe()
  if (!settings?.updates.cached) return

  await saveUpdatesPatch({cached: null})
}

async function loadSettingsSafe(): Promise<Settings | null> {
  const storage = getStorageController?.()
  if (!storage) return null

  try {
    return await storage.loadSettings()
  } catch (error) {
    logger.error(logger.CONTEXT.APP, "Failed to load settings for updater", error)
    return null
  }
}

async function saveUpdatesPatch(patch: Partial<Settings["updates"]>): Promise<void> {
  const storage = getStorageController?.()
  if (!storage) return

  try {
    const current = await storage.loadSettings()
    await storage.saveSettings({
      updates: {
        ...current.updates,
        ...patch,
      },
    })
  } catch (error) {
    logger.error(logger.CONTEXT.APP, "Failed to save updater settings", error)
  }
}

function parseJsonSafe<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      ...BREW_ENV,
      PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin`,
    }

    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let didTimeout = false
    let didFinish = false

    const timeout = setTimeout(() => {
      didTimeout = true
      child.kill("SIGTERM")
    }, timeoutMs)

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.on("error", (error) => {
      if (didFinish) return
      didFinish = true
      clearTimeout(timeout)
      resolve({
        code: -1,
        stdout,
        stderr: stderr || String(error),
        didTimeout,
      })
    })

    child.on("close", (code) => {
      if (didFinish) return
      didFinish = true
      clearTimeout(timeout)
      resolve({
        code: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        didTimeout,
      })
    })
  })
}
