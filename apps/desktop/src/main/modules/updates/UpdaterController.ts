import {spawn} from "node:child_process"
import {rm} from "node:fs/promises"
import path from "node:path"
import {app, powerMonitor} from "electron"

import {ENV, logger} from "@daily/core"

import {IS_DEMO} from "@main/demo/profile"
import {applyPendingInstallResult} from "./utils/applyPendingInstallResult"
import {clearPendingInstallFailure} from "./utils/clearPendingInstallFailure"
import {compareVersions} from "./utils/compareVersions"
import {clearConfirmedRelease, readConfirmedRelease, writeConfirmedRelease} from "./utils/confirmedRelease"
import {createInstallerScript} from "./utils/createInstallerScript"
import {githubCooldown} from "./utils/githubCooldown"
import {readPendingInstallFailure} from "./utils/readPendingInstallFailure"
import {cachedDmgMatches, findCachedRelease, isManagedDmgPath, releaseDmgPath} from "./utils/releaseCache"
import {removeManagedUpdateFiles} from "./utils/removeManagedUpdateFiles"
import {readUpdateCheckSchedule, writeUpdateCheckSchedule} from "./utils/updateCheckSchedule"
import {downloadRelease, resolveLatestRelease} from "./release"

import type {IStorageController} from "@daily/core"
import type {AppUpdateCacheState} from "@daily/protocol"
import type {AppUpdateInstallFailure, AppUpdateOffer, AppUpdateState} from "@shared/types/update"
import type {BrowserWindow} from "electron"
import type {PendingInstallFailure, ReleaseMeta} from "./types"
import type {UpdateCheckSchedule} from "./utils/updateCheckSchedule"

const MINUTE = 60_000
const UPDATES_UNAVAILABLE_REASON = IS_DEMO ? "Updates are disabled in Daily Demo." : "In-app updates are available only on macOS."

export class UpdaterController {
  private mainWindow: BrowserWindow | null = null
  private getStorageController: (() => IStorageController | null) | null = null
  private checkInFlight: Promise<AppUpdateState> | null = null
  private initialization: Promise<void> | null = null
  private schedule: Promise<UpdateCheckSchedule> | null = null
  private timer: NodeJS.Timeout | undefined
  private scheduling = false
  private isApplyingUpdate = false
  private confirmedRelease: ReleaseMeta | null = null
  private restoringRelease: Promise<void> | null = null
  private pendingInstallFailure: PendingInstallFailure | null = null
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
    if (!this.isUpdaterSupported()) {
      this.setUpdateState({
        status: "unavailable",
        reason: UPDATES_UNAVAILABLE_REASON,
        checkedAt: new Date().toISOString(),
      })
      return this.getState()
    }
    if (this.isApplyingUpdate || this.updateState.status === "installing") return this.getState()

    return (this.checkInFlight ??= this.runCheck(options?.manual ?? true).finally(() => {
      this.checkInFlight = null
    }))
  }

  async downloadUpdate(offer: AppUpdateOffer): Promise<boolean> {
    if (this.checkInFlight) await this.checkInFlight

    const release = this.confirmedRelease
    if (!release || release.version !== offer?.version || release.hash !== offer?.hash) {
      this.emitState()
      return false
    }

    return this.applyUpdate()
  }

  initialize(): Promise<void> {
    return (this.initialization ??= this.initializeUpdater())
  }

  private async initializeUpdater(): Promise<void> {
    if (!this.isUpdaterSupported()) {
      this.setUpdateState({
        status: "unavailable",
        reason: UPDATES_UNAVAILABLE_REASON,
      })
      return
    }

    await this.restoreConfirmedRelease()

    if (!app.isPackaged || ENV.isDevelopment) {
      await this.checkForUpdate({manual: false})
      return
    }

    this.scheduling = true
    powerMonitor.on("resume", this.pollForUpdates)
    app.once("will-quit", () => {
      this.scheduling = false
      clearTimeout(this.timer)
      powerMonitor.off("resume", this.pollForUpdates)
    })
    await this.checkForUpdateIfDue()
  }

  private readonly pollForUpdates = () => {
    void this.checkForUpdateIfDue()
  }

  private async checkForUpdateIfDue(): Promise<void> {
    const schedule = await this.loadSchedule()
    if (!this.scheduling) return
    if (schedule.nextCheckAt > Date.now()) {
      this.armNextCheck(schedule)
      return
    }
    if (this.isApplyingUpdate || this.updateState.status === "installing") {
      this.armNextCheck(schedule, MINUTE)
      return
    }
    await this.checkForUpdate({manual: false})
  }

  private async runCheck(manual: boolean): Promise<AppUpdateState> {
    const schedule = await this.loadSchedule()
    let retryAfterCooldown = false
    let previous = this.getState()

    try {
      await this.restoreConfirmedRelease()
      previous = this.getState()
      this.setUpdateState({status: "checking", reason: null, downloadProgress: null})

      const result = await resolveLatestRelease({
        currentVersion: app.getVersion(),
        confirmedRelease: this.confirmedRelease,
        canRequestGitHub: () => Date.now() >= schedule.restNotBefore,
        onGitHubResponse: async (response) => {
          const cooldown = githubCooldown(response, Date.now(), schedule.fallbackFailures)
          if (!cooldown) return

          retryAfterCooldown = !response.ok
          if (cooldown.restNotBefore === schedule.restNotBefore && cooldown.fallbackFailures === schedule.fallbackFailures) return
          Object.assign(schedule, cooldown)
          await writeUpdateCheckSchedule(schedule)
        },
      })
      const checkedAt = new Date().toISOString()

      if (result.kind === "current") {
        await clearConfirmedRelease()
        this.confirmedRelease = null
        await removeManagedUpdateFiles()
        await this.forgetInstallFailure()
        this.setUpdateState({
          status: "idle",
          source: "github",
          availableVersion: null,
          availableHash: null,
          downloadedAt: null,
          downloadProgress: null,
          checkedAt,
          reason: manual ? "You're already using the latest version." : null,
          installFailure: null,
        })
      } else if (result.kind === "available") {
        await this.showConfirmedRelease(result.release, manual, checkedAt)
      } else {
        retryAfterCooldown = true
        this.setUpdateState({...previous, checkedAt})
      }
    } catch (error) {
      logger.error(logger.CONTEXT.UPDATES, "Update manager failed", error)
      const checkedAt = new Date().toISOString()
      if (previous.availableVersion) {
        this.setUpdateState({...previous, checkedAt})
      } else {
        this.setUpdateState({
          status: "error",
          reason: manual ? (error instanceof Error ? error.message : "Failed to check for updates.") : null,
          downloadProgress: null,
          checkedAt,
        })
      }
    } finally {
      if (this.scheduling) await this.finishScheduledCheck(schedule, retryAfterCooldown)
    }

    return this.getState()
  }

  private loadSchedule(): Promise<UpdateCheckSchedule> {
    return (this.schedule ??= readUpdateCheckSchedule())
  }

  private async finishScheduledCheck(schedule: UpdateCheckSchedule, retryAfterCooldown: boolean): Promise<void> {
    const CHECK_INTERVAL = 60 * MINUTE
    const CHECK_JITTER = 10 * MINUTE
    const MAX_ACCELERATED_FALLBACK_RETRIES = 3

    const now = Date.now()
    let nextCheckAt = schedule.nextCheckAt
    if (nextCheckAt <= now) nextCheckAt = now + CHECK_INTERVAL + Math.round((2 * Math.random() - 1) * CHECK_JITTER)
    if (retryAfterCooldown && schedule.restNotBefore > now && schedule.fallbackFailures <= MAX_ACCELERATED_FALLBACK_RETRIES) {
      nextCheckAt = Math.min(nextCheckAt, schedule.restNotBefore + Math.round(Math.random() * MINUTE))
    }

    if (nextCheckAt !== schedule.nextCheckAt) {
      schedule.nextCheckAt = nextCheckAt
      await writeUpdateCheckSchedule(schedule)
    }
    this.armNextCheck(schedule)
  }

  private armNextCheck(schedule: UpdateCheckSchedule, minimumDelay = 1) {
    const MAX_TIMER_DELAY = 2 ** 31 - 1

    if (!this.scheduling) return
    clearTimeout(this.timer)
    const delay = Math.min(Math.max(minimumDelay, schedule.nextCheckAt - Date.now()), MAX_TIMER_DELAY)
    this.timer = setTimeout(this.pollForUpdates, delay)
    this.timer.unref()
  }

  private async applyUpdate(): Promise<boolean> {
    if (!this.isUpdaterSupported()) {
      this.setUpdateState({status: "unavailable", reason: UPDATES_UNAVAILABLE_REASON})
      return false
    }
    if (this.checkInFlight || this.isApplyingUpdate || this.updateState.status === "installing") {
      this.emitState()
      return false
    }

    const release = this.confirmedRelease
    if (!release || compareVersions(release.version, app.getVersion()) <= 0) {
      this.setUpdateState({status: "error", reason: "No update is available. Please check for updates again."})
      return false
    }

    this.isApplyingUpdate = true
    try {
      const cachedRelease = await this.getCachedRelease(release)
      if (cachedRelease) return await this.startInstall(release, cachedRelease)
      this.setUpdateState({status: "downloading", downloadProgress: 0, downloadedAt: null, reason: null, installFailure: null})
      const downloaded = await downloadRelease(release, (progress) => {
        this.setUpdateState({downloadProgress: progress})
      })
      return await this.startInstall(release, downloaded)
    } catch (error) {
      logger.error(logger.CONTEXT.UPDATES, "Failed to apply update", error)
      this.setUpdateState({
        status: "error",
        reason: error instanceof Error ? error.message : "Failed to apply update.",
        downloadProgress: null,
      })
      return false
    } finally {
      this.isApplyingUpdate = false
    }
  }

  private async startInstall(release: ReleaseMeta, cachedRelease: AppUpdateCacheState): Promise<boolean> {
    const {cachePath} = cachedRelease
    if (!cachePath || !(await cachedDmgMatches(cachePath, release.hash))) {
      if (cachePath && (await isManagedDmgPath(cachePath))) await rm(cachePath, {force: true})
      await this.forgetInstallFailure()
      this.setUpdateState({
        status: "error",
        downloadedAt: null,
        downloadProgress: null,
        reason: "The cached update hash does not match the confirmed release. Download the update again.",
        installFailure: null,
      })
      return false
    }

    const installerPath = await createInstallerScript(cachedRelease)
    if (!installerPath) {
      this.setUpdateState({
        status: "error",
        downloadedAt: cachedRelease.downloadedAt,
        downloadProgress: null,
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
      downloadedAt: cachedRelease.downloadedAt,
      reason: null,
      downloadProgress: null,
      installFailure: null,
    })

    app.quit()
    return true
  }

  private restoreConfirmedRelease(): Promise<void> {
    return (this.restoringRelease ??= this.loadConfirmedRelease())
  }

  private async loadConfirmedRelease(): Promise<void> {
    try {
      await applyPendingInstallResult()
      this.pendingInstallFailure = await readPendingInstallFailure()
      const release = await readConfirmedRelease()
      if (release && compareVersions(release.version, app.getVersion()) > 0) await this.showConfirmedRelease(release, false, null)
    } catch (error) {
      logger.error(logger.CONTEXT.UPDATES, "Failed to restore confirmed release", error)
    }
  }

  private async showConfirmedRelease(release: ReleaseMeta, manual: boolean, checkedAt: string | null): Promise<void> {
    const INSTALL_FAILED_REASON = "The last update could not be installed."

    const cachedRelease = await this.getCachedRelease(release)
    if (checkedAt && release !== this.confirmedRelease) {
      await writeConfirmedRelease(release)
      const keepDirectories = [path.dirname(releaseDmgPath(release))]
      if (cachedRelease?.cachePath) keepDirectories.push(path.dirname(cachedRelease.cachePath))
      await removeManagedUpdateFiles(keepDirectories)
    }

    const installFailure = await this.resolveInstallFailure(release)
    this.confirmedRelease = release
    this.setUpdateState({
      status: cachedRelease ? "downloaded" : "available",
      source: release.source,
      availableVersion: release.version,
      availableHash: release.hash,
      downloadedAt: cachedRelease?.downloadedAt ?? null,
      downloadProgress: null,
      checkedAt,
      reason: installFailure ? INSTALL_FAILED_REASON : manual ? `Update ${release.version} is available.` : null,
      installFailure,
    })
  }

  private async getCachedRelease(release: ReleaseMeta): Promise<AppUpdateCacheState | null> {
    const cached = await findCachedRelease(release)
    if (cached) return cached

    const legacyCache = await this.readLegacyCache()
    return legacyCache ? findCachedRelease(release, legacyCache) : null
  }

  private async readLegacyCache(): Promise<AppUpdateCacheState | null> {
    const storage = this.getStorageController?.()
    if (!storage) return null

    try {
      return (await storage.loadSettings()).updates.cached
    } catch (error) {
      logger.error(logger.CONTEXT.UPDATES, "Failed to load legacy updater cache", error)
      return null
    }
  }

  private async resolveInstallFailure(release: ReleaseMeta): Promise<AppUpdateInstallFailure | null> {
    const failure = this.pendingInstallFailure
    if (!failure) return null

    if (failure.releaseId !== release.releaseId) {
      await this.forgetInstallFailure()
      return null
    }

    return {version: failure.version, attemptedAt: failure.attemptedAt, code: failure.code}
  }

  private async forgetInstallFailure(): Promise<void> {
    if (!this.pendingInstallFailure) return

    this.pendingInstallFailure = null
    await clearPendingInstallFailure()
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
      reason: this.isUpdaterSupported() ? null : UPDATES_UNAVAILABLE_REASON,
      installFailure: null,
    }
  }

  private isUpdaterSupported(): boolean {
    return process.platform === "darwin" && !IS_DEMO
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
