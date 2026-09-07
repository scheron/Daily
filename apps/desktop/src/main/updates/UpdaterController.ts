import {spawn} from "node:child_process"
import {existsSync} from "node:fs"
import {app} from "electron"

import {logger} from "@daily/core"

import {UPDATES_CONFIG} from "@shared/config/updates"
import {GitHubRateLimitError} from "@shared/errors/updates/GitHubRateLimitError"
import {applyPendingInstallResult} from "./utils/applyPendingInstallResult"
import {compareVersions} from "./utils/compareVersions"
import {createInstallerScript} from "./utils/createInstallerScript"
import {removeManagedUpdateFiles} from "./utils/removeManagedUpdateFiles"
import {downloadRelease, fetchLatestRelease} from "./release"

import type {IStorageController} from "@daily/core"
import type {AppUpdateLookupState, Settings} from "@daily/protocol"
import type {ReleaseMeta} from "@main/types/updates"
import type {AppUpdateState} from "@shared/types/update"
import type {BrowserWindow} from "electron"

export class UpdaterController {
  private mainWindow: BrowserWindow | null = null
  private getStorageController: (() => IStorageController | null) | null = null
  private isCheckingForUpdate = false
  private updateState: AppUpdateState = this.createDefaultUpdateState()

  setStorageController(getStorage: () => IStorageController | null) {
    this.getStorageController = getStorage
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  syncState() {
    this.emitState()
  }

  getState(): AppUpdateState {
    return {...this.updateState}
  }

  async checkForUpdate(options?: {manual?: boolean}): Promise<AppUpdateState> {
    const manual = options?.manual ?? true

    if (!this.isUpdaterSupported()) {
      this.setUpdateState({
        status: "unavailable",
        reason: "In-app updates are available only on macOS.",
        checkedAt: new Date().toISOString(),
      })
      return this.getState()
    }

    if (this.isCheckingForUpdate) return this.getState()

    this.isCheckingForUpdate = true
    this.setUpdateState({
      status: "checking",
      reason: null,
      downloadProgress: null,
    })

    try {
      const settings = await this.loadSettingsSafe()
      const release = await this.resolveRelease(settings, {force: manual})
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

      if (this.isInstalledRelease(release, settings)) {
        logger.info(logger.CONTEXT.UPDATES, "Update not required: current version matches latest release", {
          currentVersion: app.getVersion(),
          latestVersion: release.version,
          latestHash: release.hash,
        })

        await this.clearCachedUpdateState()
        this.setUpdateState({
          status: "idle",
          source: release.source,
          availableVersion: null,
          availableHash: null,
          downloadedAt: null,
          downloadProgress: null,
          checkedAt: new Date().toISOString(),
          reason: manual ? "You're already using the latest version." : null,
        })
        return this.getState()
      }

      const cachedRelease = this.getCachedRelease(settings, release)
      if (settings?.updates.cached && !cachedRelease) {
        await this.clearCachedUpdateState()
      }

      logger.info(logger.CONTEXT.UPDATES, "Update available", {
        currentVersion: app.getVersion(),
        currentHash: installedRelease?.hash ?? null,
        latestVersion: release.version,
        latestHash: release.hash,
        latestSource: release.source,
      })

      this.setUpdateState({
        status: cachedRelease ? "downloaded" : "available",
        source: release.source,
        availableVersion: release.version,
        availableHash: release.hash,
        downloadedAt: cachedRelease?.downloadedAt ?? null,
        downloadProgress: null,
        checkedAt: new Date().toISOString(),
        reason: manual ? `Update ${release.version} is available.` : null,
      })
    } catch (error: any) {
      if (error instanceof GitHubRateLimitError && !manual) {
        logger.warn(logger.CONTEXT.UPDATES, "Skipped background update check: GitHub rate limit reached", {
          resetAt: error.resetAt?.toISOString() ?? null,
        })
        this.setUpdateState({status: "idle", reason: null, downloadProgress: null})
        return this.getState()
      }

      logger.error(logger.CONTEXT.UPDATES, "Update manager failed", error)
      this.setUpdateState({
        status: "error",
        reason: error?.message ?? "Failed to check for updates.",
        downloadProgress: null,
        checkedAt: new Date().toISOString(),
      })
    } finally {
      this.isCheckingForUpdate = false
    }

    return this.getState()
  }

  async downloadUpdate(): Promise<boolean> {
    if (!this.isUpdaterSupported()) {
      this.setUpdateState({
        status: "unavailable",
        reason: "In-app updates are available only on macOS.",
      })
      return false
    }

    if (!this.updateState.availableVersion) {
      this.setUpdateState({
        status: "error",
        reason: "No update is available. Please check for updates again.",
      })
      return false
    }

    try {
      const settings = await this.loadSettingsSafe()
      const release = await this.resolveRelease(settings)

      if (this.isInstalledRelease(release, settings)) {
        this.setUpdateState({
          status: "idle",
          source: release.source,
          availableVersion: null,
          availableHash: null,
          reason: "You're already using the latest version.",
          checkedAt: new Date().toISOString(),
        })
        return false
      }

      const cachedRelease = this.getCachedRelease(settings, release)
      if (cachedRelease) {
        return await this.startInstall(release, cachedRelease)
      }

      if (settings?.updates.cached) {
        await this.clearCachedUpdateState()
      }

      this.setUpdateState({
        status: "downloading",
        source: release.source,
        availableVersion: release.version,
        availableHash: release.hash,
        downloadProgress: 0,
        reason: null,
      })

      const downloadedRelease = await downloadRelease(release, (progress) => {
        this.setUpdateState({
          status: "downloading",
          source: release.source,
          availableVersion: release.version,
          availableHash: release.hash,
          downloadProgress: progress,
        })
      })

      await this.saveUpdatesPatch({cached: downloadedRelease})

      return await this.startInstall(release, downloadedRelease)
    } catch (error: any) {
      logger.error(logger.CONTEXT.UPDATES, "Failed to download update", error)
      this.setUpdateState({
        status: "error",
        reason: error?.message ?? "Failed to download update.",
        downloadProgress: null,
      })
      return false
    }
  }

  async installDownloadedUpdate(): Promise<boolean> {
    if (!this.isUpdaterSupported()) {
      this.setUpdateState({
        status: "unavailable",
        reason: "In-app updates are available only on macOS.",
      })
      return false
    }

    try {
      const settings = await this.loadSettingsSafe()
      const release = await this.resolveRelease(settings)

      if (this.isInstalledRelease(release, settings)) {
        this.setUpdateState({
          status: "idle",
          source: release.source,
          availableVersion: null,
          availableHash: null,
          downloadedAt: null,
          checkedAt: new Date().toISOString(),
          reason: "You're already using the latest version.",
        })
        return false
      }

      const cachedRelease = this.getCachedRelease(settings, release)
      if (!cachedRelease) {
        this.setUpdateState({
          status: "error",
          source: release.source,
          availableVersion: release.version,
          availableHash: release.hash,
          downloadedAt: null,
          reason: "Download the update first.",
          checkedAt: new Date().toISOString(),
        })
        return false
      }

      return await this.startInstall(release, cachedRelease)
    } catch (error: any) {
      logger.error(logger.CONTEXT.UPDATES, "Failed to install update", error)
      this.setUpdateState({
        status: "error",
        reason: error?.message ?? "Failed to install update.",
        downloadProgress: null,
      })
      return false
    }
  }

  async initialize(): Promise<void> {
    if (!this.isUpdaterSupported()) {
      this.setUpdateState({
        status: "unavailable",
        reason: "In-app updates are available only on macOS.",
      })
      return
    }

    await applyPendingInstallResult((patch) => this.saveUpdatesPatch(patch))
    await this.checkForUpdate({manual: false})
  }

  private isInstalledRelease(release: ReleaseMeta, settings: Settings | null): boolean {
    if (compareVersions(app.getVersion(), release.version) !== 0) return false

    const installed = settings?.updates.installed
    if (!installed || installed.version !== release.version) return true
    if (release.hash && installed.hash) return release.hash === installed.hash

    return installed.releaseId === release.releaseId || installed.version === release.version
  }

  private getCachedRelease(settings: Settings | null, release: ReleaseMeta) {
    const cached = settings?.updates.cached
    if (!cached) return null
    if (cached.releaseId !== release.releaseId) return null
    if (cached.version !== release.version) return null
    if (release.hash && cached.hash && release.hash !== cached.hash) return null
    if (!cached.cachePath || !existsSync(cached.cachePath)) return null

    return cached
  }

  private async resolveRelease(settings: Settings | null, options?: {force?: boolean}): Promise<ReleaseMeta> {
    const lookup = settings?.updates.lookup ?? null
    const cachedRelease = lookup?.release ?? null

    if (!options?.force && cachedRelease && this.isLookupFresh(lookup)) {
      logger.info(logger.CONTEXT.UPDATES, "Reusing cached release metadata", {
        version: cachedRelease.version,
        checkedAt: lookup?.checkedAt ?? null,
      })
      return cachedRelease
    }

    try {
      const result = await fetchLatestRelease(cachedRelease ? (lookup?.etag ?? null) : null)

      if (result.status === "not-modified" && cachedRelease) {
        await this.saveUpdatesPatch({lookup: {checkedAt: new Date().toISOString(), etag: lookup?.etag ?? null, release: cachedRelease}})
        return cachedRelease
      }

      if (result.status === "not-modified") throw new Error("Failed to read GitHub release metadata.")

      await this.saveUpdatesPatch({lookup: {checkedAt: new Date().toISOString(), etag: result.etag, release: result.release}})
      return result.release
    } catch (error) {
      if (error instanceof GitHubRateLimitError && cachedRelease) {
        logger.warn(logger.CONTEXT.UPDATES, "GitHub rate limit reached, serving the last known release", {
          version: cachedRelease.version,
          checkedAt: lookup?.checkedAt ?? null,
        })
        return cachedRelease
      }
      throw error
    }
  }

  private isLookupFresh(lookup: AppUpdateLookupState | null): boolean {
    if (!lookup) return false

    const age = Date.now() - new Date(lookup.checkedAt).getTime()
    return Number.isFinite(age) && age >= 0 && age < UPDATES_CONFIG.githubLookupTtlMs
  }

  private async startInstall(release: ReleaseMeta, cachedRelease: Settings["updates"]["cached"]): Promise<boolean> {
    if (!cachedRelease) return false

    const installerPath = await createInstallerScript(cachedRelease)
    if (!installerPath) {
      this.setUpdateState({
        status: "error",
        source: release.source,
        availableVersion: release.version,
        availableHash: release.hash,
        downloadedAt: cachedRelease.downloadedAt,
        reason: "Failed to prepare the update installer.",
      })
      return false
    }

    const child = spawn("/bin/sh", [installerPath], {
      detached: true,
      stdio: "ignore",
    })

    child.unref()

    this.setUpdateState({
      status: "installing",
      source: release.source,
      availableVersion: release.version,
      availableHash: release.hash,
      downloadedAt: cachedRelease.downloadedAt,
      reason: null,
      downloadProgress: null,
    })

    app.quit()
    return true
  }

  private async clearCachedUpdateState(): Promise<void> {
    await removeManagedUpdateFiles()
    await this.saveUpdatesPatch({cached: null})
  }

  private async loadSettingsSafe(): Promise<Settings | null> {
    const storage = this.getStorageController?.()
    if (!storage) return null

    try {
      return await storage.loadSettings()
    } catch (error) {
      logger.error(logger.CONTEXT.UPDATES, "Failed to load settings for updater", error)
      return null
    }
  }

  private async saveUpdatesPatch(patch: Partial<Settings["updates"]>): Promise<void> {
    const storage = this.getStorageController?.()
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

  private createDefaultUpdateState(): AppUpdateState {
    return {
      status: this.isUpdaterSupported() ? "idle" : "unavailable",
      currentVersion: app.getVersion(),
      availableVersion: null,
      availableHash: null,
      source: null,
      downloadProgress: null,
      downloadedAt: null,
      checkedAt: null,
      reason: this.isUpdaterSupported() ? null : "In-app updates are available only on macOS.",
    }
  }

  private isUpdaterSupported(): boolean {
    return process.platform === "darwin"
  }

  private setUpdateState(patch: Partial<AppUpdateState>) {
    this.updateState = {
      ...this.updateState,
      ...patch,
      currentVersion: app.getVersion(),
    }
    this.emitState()
  }

  private emitState() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send("updates:state-changed", this.getState())
  }
}

export const updaterController = new UpdaterController()
