import {spawn} from "node:child_process"
import {createHash} from "node:crypto"
import {createReadStream, existsSync} from "node:fs"
import {mkdir, readFile, rm, writeFile} from "node:fs/promises"
import path from "node:path"
import {app} from "electron"

import {logger} from "@/utils/logger"

import {downloadWithProgress} from "@/ai/utils/downloadWithProgress"
import {APP_CONFIG} from "@/config"

import type {IStorageController} from "@/types/storage"
import type {AppUpdateCacheState, InstalledAppReleaseState, Settings} from "@shared/types/storage"
import type {AppUpdateState} from "@shared/types/update"
import type {BrowserWindow} from "electron"

type CommandResult = {
  code: number
  stdout: string
  stderr: string
  didTimeout: boolean
}

type BrewReleaseMeta = {
  source: "brew"
  brewBinary: string
  version: string
  hash: string | null
  releaseId: string
}

type GitHubReleaseMeta = {
  source: "github"
  version: string
  hash: string | null
  releaseId: string
  assetName: string
  assetUrl: string
}

type ReleaseMeta = BrewReleaseMeta | GitHubReleaseMeta

let getStorageController: (() => IStorageController | null) | null = null
let mainWindow: BrowserWindow | null = null
let resolvedBrewBinary: string | null = null
let isInitialized = false
let isCheckingForUpdate = false
let updateState: AppUpdateState = createDefaultUpdateState()

export function setupUpdateManager(window: BrowserWindow, getStorage: () => IStorageController | null): void {
  getStorageController = getStorage
  mainWindow = window

  window.webContents.once("did-finish-load", () => {
    emitState()
  })

  if (isInitialized) {
    emitState()
    return
  }

  isInitialized = true
  void initializeUpdateManager()
}

export function getUpdateState(): AppUpdateState {
  return {...updateState}
}

export async function checkForUpdate(options?: {manual?: boolean}): Promise<AppUpdateState> {
  const manual = options?.manual ?? true

  if (!isUpdaterSupported()) {
    setUpdateState({
      status: "unavailable",
      reason: "In-app updates are available only on macOS.",
      checkedAt: new Date().toISOString(),
    })
    return getUpdateState()
  }

  if (isCheckingForUpdate) return getUpdateState()

  isCheckingForUpdate = true
  setUpdateState({
    status: "checking",
    reason: null,
    downloadProgress: null,
  })

  try {
    const settings = await loadSettingsSafe()
    const release = await resolveLatestRelease()
    const installedRelease = settings?.updates.installed ?? null

    logger.info(logger.CONTEXT.UPDATES, "Resolved update versions", {
      manual,
      currentVersion: app.getVersion(),
      currentHash: installedRelease?.hash ?? null,
      latestVersion: release.version,
      latestHash: release.hash,
      latestSource: release.source,
      installedVersion: installedRelease?.version ?? null,
      installedHash: installedRelease?.hash ?? null,
      installedSource: installedRelease?.source ?? null,
    })

    if (isInstalledRelease(release, settings)) {
      logger.info(logger.CONTEXT.UPDATES, "Update not required: current version matches latest release", {
        currentVersion: app.getVersion(),
        latestVersion: release.version,
        latestHash: release.hash,
      })

      await clearCachedUpdateState()
      setUpdateState({
        status: "idle",
        source: release.source,
        availableVersion: null,
        availableHash: null,
        downloadedAt: null,
        downloadProgress: null,
        checkedAt: new Date().toISOString(),
        reason: manual ? "You're already using the latest version." : null,
      })
      return getUpdateState()
    }

    logger.info(logger.CONTEXT.UPDATES, "Update available", {
      currentVersion: app.getVersion(),
      currentHash: installedRelease?.hash ?? null,
      latestVersion: release.version,
      latestHash: release.hash,
      latestSource: release.source,
    })

    await clearCachedUpdateState()
    setReadyState(release, manual ? `Update ${release.version} is available.` : null)
  } catch (error: any) {
    logger.error(logger.CONTEXT.UPDATES, "Update manager failed", error)
    setUpdateState({
      status: "error",
      reason: error?.message ?? "Failed to check for updates.",
      downloadProgress: null,
      checkedAt: new Date().toISOString(),
    })
  } finally {
    isCheckingForUpdate = false
  }

  return getUpdateState()
}

export async function installDownloadedUpdate(): Promise<boolean> {
  if (!isUpdaterSupported()) {
    setUpdateState({
      status: "unavailable",
      reason: "In-app updates are available only on macOS.",
    })
    return false
  }

  if (!updateState.availableVersion) {
    setUpdateState({
      status: "error",
      reason: "No update is available. Please check for updates again.",
    })
    return false
  }

  try {
    const release = await resolveLatestRelease()
    const settings = await loadSettingsSafe()

    if (isInstalledRelease(release, settings)) {
      setUpdateState({
        status: "idle",
        source: release.source,
        availableVersion: null,
        availableHash: null,
        reason: "You're already using the latest version.",
        checkedAt: new Date().toISOString(),
      })
      return false
    }

    const downloadedRelease = await downloadRelease(release)
    const installerPath = await createInstallerScript(downloadedRelease)
    if (!installerPath) {
      setUpdateState({
        status: "error",
        source: release.source,
        availableVersion: release.version,
        availableHash: release.hash,
        reason: "Failed to prepare the update installer.",
      })
      return false
    }

    const child = spawn("/bin/sh", [installerPath], {
      detached: true,
      stdio: "ignore",
    })

    child.unref()

    setUpdateState({
      status: "installing",
      source: release.source,
      availableVersion: release.version,
      availableHash: release.hash,
      reason: null,
      downloadProgress: null,
    })

    app.quit()
    return true
  } catch (error: any) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to install update", error)
    setUpdateState({
      status: "error",
      reason: error?.message ?? "Failed to install update.",
      downloadProgress: null,
    })
    return false
  }
}

async function initializeUpdateManager(): Promise<void> {
  if (!isUpdaterSupported()) {
    setUpdateState({
      status: "unavailable",
      reason: "In-app updates are available only on macOS.",
    })
    return
  }

  await applyPendingInstallResult()
  await checkForUpdate({manual: false})
}

function createDefaultUpdateState(): AppUpdateState {
  return {
    status: isUpdaterSupported() ? "idle" : "unavailable",
    currentVersion: app.getVersion(),
    availableVersion: null,
    availableHash: null,
    source: null,
    downloadProgress: null,
    downloadedAt: null,
    checkedAt: null,
    reason: isUpdaterSupported() ? null : "In-app updates are available only on macOS.",
  }
}

function isUpdaterSupported(): boolean {
  return process.platform === "darwin"
}

async function resolveLatestRelease(): Promise<ReleaseMeta> {
  const githubRelease = await getGitHubReleaseMeta()
  if (!githubRelease) throw new Error("Failed to read GitHub release metadata.")

  const brewBinary = await resolveBrewBinary()
  if (brewBinary && (await isCaskInstalled(brewBinary))) {
    return {
      source: "brew",
      brewBinary,
      version: githubRelease.version,
      hash: githubRelease.hash,
      releaseId: githubRelease.releaseId,
    }
  }

  return githubRelease
}

async function downloadRelease(release: ReleaseMeta): Promise<AppUpdateCacheState> {
  logger.info(logger.CONTEXT.UPDATES, `Downloading update ${release.version} via ${release.source}`)

  setUpdateState({
    status: "downloading",
    source: release.source,
    availableVersion: release.version,
    availableHash: release.hash,
    downloadProgress: 0,
    reason: null,
  })

  if (release.source === "brew") {
    const result = await runCommand(release.brewBinary, ["fetch", "--cask", BREW_CASK], BREW_TIMEOUT_MS)
    if (result.code !== 0) {
      logger.error(logger.CONTEXT.UPDATES, "brew fetch failed", {stdout: result.stdout, stderr: result.stderr})
      throw new Error("Failed to download the Homebrew update.")
    }

    const cachePath = await getBrewCachePath(release.brewBinary)

    return {
      releaseId: release.releaseId,
      version: release.version,
      hash: release.hash,
      source: "brew",
      cachePath,
      downloadedAt: new Date().toISOString(),
    }
  }

  const releaseDir = getManagedReleaseDir(release.releaseId)
  const destinationPath = path.join(releaseDir, release.assetName)
  await mkdir(releaseDir, {recursive: true})

  await downloadWithProgress({
    url: release.assetUrl,
    destPath: destinationPath,
    onProgress: (downloadedBytes, totalBytes) => {
      const progress = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null
      setUpdateState({
        status: "downloading",
        source: release.source,
        availableVersion: release.version,
        availableHash: release.hash,
        downloadProgress: progress,
      })
    },
  })

  const downloadedHash = await computeFileSha256(destinationPath)
  if (release.hash && release.hash !== downloadedHash) {
    await rm(releaseDir, {recursive: true, force: true})
    throw new Error("Downloaded update hash does not match the expected release hash.")
  }

  return {
    releaseId: release.releaseId,
    version: release.version,
    hash: release.hash ?? downloadedHash,
    source: "github",
    cachePath: destinationPath,
    downloadedAt: new Date().toISOString(),
  }
}

function setReadyState(release: Pick<ReleaseMeta, "source" | "version" | "hash">, reason: string | null = null): void {
  setUpdateState({
    status: "ready",
    source: release.source,
    availableVersion: release.version,
    availableHash: release.hash,
    downloadedAt: null,
    downloadProgress: null,
    checkedAt: new Date().toISOString(),
    reason,
  })
}

async function applyPendingInstallResult(): Promise<void> {
  const markerPath = getInstallMarkerPath()
  if (!existsSync(markerPath)) return

  try {
    const content = await readFile(markerPath, "utf8")
    const installedRelease = parseJsonSafe<InstalledAppReleaseState>(content)
    if (installedRelease) {
      await saveUpdatesPatch({
        cached: null,
        installed: installedRelease,
        skippedReleaseId: null,
      })
      await removeManagedUpdateFiles()
    }
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to apply pending install marker", error)
  } finally {
    await rm(markerPath, {force: true})
  }
}

async function createInstallerScript(cachedUpdate: AppUpdateCacheState): Promise<string | null> {
  const appBundlePath = getCurrentAppBundlePath()
  const relaunchPath = getRelaunchAppPath(cachedUpdate.source, appBundlePath)
  const installResult: InstalledAppReleaseState = {
    releaseId: cachedUpdate.releaseId,
    version: cachedUpdate.version,
    hash: cachedUpdate.hash,
    source: cachedUpdate.source,
    installedAt: new Date().toISOString(),
  }

  const brewBinary = cachedUpdate.source === "brew" ? await resolveBrewBinary() : null
  if (cachedUpdate.source === "brew" && !brewBinary) return null
  if (cachedUpdate.source === "github" && (!cachedUpdate.cachePath || !existsSync(cachedUpdate.cachePath))) return null

  const updatesDir = getManagedUpdatesDir()
  const scriptPath = path.join(updatesDir, `install-${Date.now()}.sh`)
  await mkdir(updatesDir, {recursive: true})

  const script = [
    "#!/bin/sh",
    "set -eu",
    `TARGET_PID=${process.pid}`,
    `PROVIDER=${shellEscape(cachedUpdate.source)}`,
    `APP_BUNDLE_PATH=${shellEscape(appBundlePath)}`,
    `RELAUNCH_PATH=${shellEscape(relaunchPath)}`,
    `APP_NAME=${shellEscape(APP_CONFIG.name)}`,
    `BREW_BINARY=${shellEscape(brewBinary ?? "")}`,
    `BREW_CASK=${shellEscape(BREW_CASK)}`,
    `DOWNLOAD_PATH=${shellEscape(cachedUpdate.cachePath ?? "")}`,
    `MARKER_PATH=${shellEscape(getInstallMarkerPath())}`,
    `MARKER_JSON=${shellEscape(JSON.stringify(installResult))}`,
    `CLEANUP_PATH=${shellEscape(cachedUpdate.cachePath ?? "")}`,
    "SUCCESS=0",
    "MOUNT_POINT=",
    'BACKUP_PATH="$APP_BUNDLE_PATH.codex-update-backup"',
    "relaunch_app() {",
    '  if [ -d "$RELAUNCH_PATH" ]; then open "$RELAUNCH_PATH" >/dev/null 2>&1 || true; else open -a "$APP_NAME" >/dev/null 2>&1 || true; fi',
    "}",
    "cleanup() {",
    '  if [ -n "$MOUNT_POINT" ]; then hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true; fi',
    '  if [ "$SUCCESS" -ne 1 ]; then',
    '    if [ -d "$BACKUP_PATH" ] && [ ! -d "$APP_BUNDLE_PATH" ]; then mv "$BACKUP_PATH" "$APP_BUNDLE_PATH"; fi',
    "    relaunch_app",
    "  else",
    '    rm -rf "$BACKUP_PATH" >/dev/null 2>&1 || true',
    '    if [ -n "$CLEANUP_PATH" ] && [ -e "$CLEANUP_PATH" ]; then rm -rf "$CLEANUP_PATH" >/dev/null 2>&1 || true; fi',
    '    if [ -n "$CLEANUP_PATH" ]; then rmdir "$(dirname "$CLEANUP_PATH")" >/dev/null 2>&1 || true; fi',
    "  fi",
    '  rm -f "$0" >/dev/null 2>&1 || true',
    "}",
    "trap cleanup EXIT",
    'while kill -0 "$TARGET_PID" >/dev/null 2>&1; do sleep 1; done',
    'if [ "$PROVIDER" = "brew" ]; then',
    '  env HOMEBREW_NO_AUTO_UPDATE=1 PATH="$PATH:/opt/homebrew/bin:/usr/local/bin" "$BREW_BINARY" upgrade --cask "$BREW_CASK"',
    "else",
    '  MOUNT_POINT=$(hdiutil attach "$DOWNLOAD_PATH" -nobrowse | awk \'/\\/Volumes\\// { $1=$2=""; sub(/^  */, ""); print; exit }\')',
    '  if [ -z "$MOUNT_POINT" ]; then exit 1; fi',
    '  rm -rf "$BACKUP_PATH" >/dev/null 2>&1 || true',
    '  if [ -d "$APP_BUNDLE_PATH" ]; then mv "$APP_BUNDLE_PATH" "$BACKUP_PATH"; fi',
    '  cp -R "$MOUNT_POINT/Daily.app" "$APP_BUNDLE_PATH"',
    '  if [ ! -d "$APP_BUNDLE_PATH" ]; then',
    '    rm -rf "$APP_BUNDLE_PATH" >/dev/null 2>&1 || true',
    '    if [ -d "$BACKUP_PATH" ]; then mv "$BACKUP_PATH" "$APP_BUNDLE_PATH"; fi',
    "    exit 1",
    "  fi",
    '  xattr -rd com.apple.quarantine "$APP_BUNDLE_PATH" >/dev/null 2>&1 || true',
    "fi",
    'mkdir -p "$(dirname "$MARKER_PATH")"',
    'printf \'%s\' "$MARKER_JSON" > "$MARKER_PATH"',
    "SUCCESS=1",
    "relaunch_app",
    "",
  ].join("\n")

  await writeFile(scriptPath, script, {mode: 0o700})
  return scriptPath
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
    if (candidate !== "brew" && !existsSync(candidate)) continue

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

async function getGitHubReleaseMeta(): Promise<GitHubReleaseMeta | null> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: GITHUB_HEADERS,
  })

  if (!response.ok) {
    throw new Error(`GitHub releases API returned ${response.status} ${response.statusText}.`)
  }

  const payload = (await response.json()) as {
    tag_name?: string
    assets?: Array<{
      id?: number
      name?: string
      browser_download_url?: string
      digest?: string | null
    }>
  }

  const version = normalizeVersion(payload.tag_name)
  const asset = payload.assets?.find((item) => typeof item.name === "string" && /-mac\.dmg$/i.test(item.name))
  if (!version || !asset?.browser_download_url || !asset.name || typeof asset.id !== "number") return null

  const hash = normalizeGitHubDigest(asset.digest)
  const releaseId = buildReleaseId(version, hash, asset.id)

  return {
    source: "github",
    version,
    hash,
    releaseId,
    assetName: asset.name,
    assetUrl: asset.browser_download_url,
  }
}

function normalizeVersion(tagName?: string): string | null {
  if (!tagName) return null
  return tagName.replace(/^v/i, "").trim() || null
}

function normalizeGitHubDigest(digest?: string | null): string | null {
  if (!digest) return null
  const normalized = digest.trim()
  if (!normalized) return null
  return normalized.startsWith("sha256:") ? normalized.slice("sha256:".length) : normalized
}

function buildReleaseId(version: string, hash: string | null, fallbackId?: number): string {
  if (hash) return `${version}:${hash}`
  if (fallbackId !== undefined) return `${version}:asset-${fallbackId}`
  return version
}

async function getBrewCachePath(brewBinary: string): Promise<string | null> {
  const result = await runCommand(brewBinary, ["--cache", "--cask", BREW_CASK], 15_000)
  if (result.code !== 0) return null

  const cachePath = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)

  if (!cachePath) return null
  return existsSync(cachePath) ? cachePath : null
}

function isInstalledRelease(release: ReleaseMeta, settings: Settings | null): boolean {
  if (compareVersions(app.getVersion(), release.version) !== 0) return false

  const installed = settings?.updates.installed
  if (!installed || installed.version !== release.version) return true
  if (release.hash && installed.hash) return release.hash === installed.hash

  return installed.releaseId === release.releaseId || installed.version === release.version
}

async function clearCachedUpdateState(): Promise<void> {
  await removeManagedUpdateFiles()
  await saveUpdatesPatch({cached: null})
}

async function removeManagedUpdateFiles(): Promise<void> {
  try {
    await rm(path.join(getManagedUpdatesDir(), "releases"), {recursive: true, force: true})
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to remove managed update files", error)
  }
}

async function loadSettingsSafe(): Promise<Settings | null> {
  const storage = getStorageController?.()
  if (!storage) return null

  try {
    return await storage.loadSettings()
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to load settings for updater", error)
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
    logger.error(logger.CONTEXT.UPDATES, "Failed to save updater settings", error)
  }
}

function setUpdateState(patch: Partial<AppUpdateState>): void {
  updateState = {
    ...updateState,
    ...patch,
    currentVersion: app.getVersion(),
  }
  emitState()
}

function emitState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send("updates:state-changed", getUpdateState())
}

function getManagedUpdatesDir(): string {
  return path.join(app.getPath("userData"), "updates")
}

function getManagedReleaseDir(releaseId: string): string {
  return path.join(getManagedUpdatesDir(), "releases", sanitizePathSegment(releaseId))
}

function getInstallMarkerPath(): string {
  return path.join(getManagedUpdatesDir(), "install-result.json")
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function getCurrentAppBundlePath(): string {
  return path.resolve(process.execPath, "../../..")
}

function getRelaunchAppPath(source: AppUpdateCacheState["source"], appBundlePath: string): string {
  if (source === "brew") return path.join("/Applications", `${APP_CONFIG.name}.app`)
  return appBundlePath
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  const stream = createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest("hex")
}

function compareVersions(left: string, right: string): number {
  const [leftMain, leftPre = ""] = left.split("-", 2)
  const [rightMain, rightPre = ""] = right.split("-", 2)
  const leftParts = leftMain.split(".").map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = rightMain.split(".").map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }

  if (!leftPre && !rightPre) return 0
  if (!leftPre) return 1
  if (!rightPre) return -1

  return leftPre.localeCompare(rightPre, undefined, {numeric: true})
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

const BREW_CASK = APP_CONFIG.updates.brewCask
const BREW_TIMEOUT_MS = APP_CONFIG.updates.brewTimeoutMs
const GITHUB_REPO = APP_CONFIG.updates.githubRepo
const BREW_ENV = APP_CONFIG.updates.brewEnv
const GITHUB_HEADERS = APP_CONFIG.updates.githubHeaders
