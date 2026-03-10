import {spawn} from "node:child_process"
import {app} from "electron"

import {logger} from "@/utils/logger"

import {applyPendingInstallResult} from "./utils/applyPendingInstallResult"
import {compareVersions} from "./utils/compareVersions"
import {createInstallerScript} from "./utils/createInstallerScript"
import {removeManagedUpdateFiles} from "./utils/removeManagedUpdateFiles"
import {downloadRelease, resolveBrewBinary, resolveLatestRelease} from "./release"

import type {IStorageController} from "@/types/storage"
import type {Settings} from "@shared/types/storage"
import type {AppUpdateState} from "@shared/types/update"
import type {BrowserWindow} from "electron"
import type {ReleaseMeta} from "../types/updates"

export class UpdaterController {
  private mainWindow: BrowserWindow | null = null
  private getStorageController: (() => IStorageController | null) | null = null
  private isCheckingForUpdate = false
  private updateState: AppUpdateState = this.createDefaultUpdateState()

  setStorageController(getStorage: () => IStorageController | null): void {
    this.getStorageController = getStorage
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  syncState(): void {
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

      logger.info(logger.CONTEXT.UPDATES, "Update available", {
        currentVersion: app.getVersion(),
        currentHash: installedRelease?.hash ?? null,
        latestVersion: release.version,
        latestHash: release.hash,
        latestSource: release.source,
      })

      await this.clearCachedUpdateState()
      this.setUpdateState({
        status: "ready",
        source: release.source,
        availableVersion: release.version,
        availableHash: release.hash,
        downloadedAt: null,
        downloadProgress: null,
        checkedAt: new Date().toISOString(),
        reason: manual ? `Update ${release.version} is available.` : null,
      })
    } catch (error: any) {
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

  async installDownloadedUpdate(): Promise<boolean> {
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
      const release = await resolveLatestRelease()
      const settings = await this.loadSettingsSafe()

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

      const installerPath = await createInstallerScript(downloadedRelease, resolveBrewBinary)
      if (!installerPath) {
        this.setUpdateState({
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

      this.setUpdateState({
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

  private setUpdateState(patch: Partial<AppUpdateState>): void {
    this.updateState = {
      ...this.updateState,
      ...patch,
      currentVersion: app.getVersion(),
    }
    this.emitState()
  }

  private emitState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send("updates:state-changed", this.getState())
  }
}

export const updaterController = new UpdaterController()
