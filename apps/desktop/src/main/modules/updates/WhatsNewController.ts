import {mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs"
import {dirname} from "node:path"

import {logger} from "@daily/core"

import {compareVersions} from "./utils/compareVersions"
import {fetchWhatsNewRelease, isSafeWhatsNewMediaUrl, whatsNewReleaseUrl} from "./whatsNewRelease"

import type {WhatsNewRelease, WhatsNewReleaseResult} from "@shared/types/update"

type WhatsNewState = {
  lastVersion: string
  pendingVersion: string | null
  shownVersions: string[]
  cachedRelease: WhatsNewRelease | null
}

export class WhatsNewController {
  private _state: WhatsNewState | null = null
  private _load: Promise<WhatsNewReleaseResult> | null = null
  private _retryAt: number | null = null

  constructor(
    version: string,
    private readonly _path: string,
  ) {
    const previous = readState(_path)
    if (previous?.lastVersion === version) {
      this._state = previous
      return
    }

    const shownVersions = previous?.shownVersions ?? []
    const isUpgrade = previous && compareVersions(version, previous.lastVersion) > 0
    const state = {
      lastVersion: version,
      pendingVersion: isUpgrade && !shownVersions.includes(version) ? version : null,
      shownVersions,
      cachedRelease: null,
    }
    if (this._persist(state)) this._state = state
  }

  async getRelease(): Promise<WhatsNewReleaseResult> {
    const state = this._state
    const version = state?.pendingVersion
    if (!version) return null

    if (state.cachedRelease) return state.cachedRelease
    if (this._retryAt !== null && Date.now() >= this._retryAt) {
      this._load = null
      this._retryAt = null
    }
    return (this._load ??= this._loadRelease(version))
  }

  markShown(version: string): boolean {
    if (!this._state || this._state.pendingVersion !== version || this._state.cachedRelease?.version !== version) return false

    const state = {
      ...this._state,
      pendingVersion: null,
      shownVersions: [...this._state.shownVersions, version],
      cachedRelease: null,
    }
    if (!this._persist(state)) return false
    this._state = state
    return true
  }

  private async _loadRelease(version: string): Promise<WhatsNewReleaseResult> {
    const result = await fetchWhatsNewRelease(version)
    if (!this._state || this._state.pendingVersion !== version || !result) return null
    if ("retryAt" in result) {
      this._retryAt = result.retryAt
      return result
    }
    if (result.version !== version) return null

    this._state = {...this._state, cachedRelease: result}
    this._persist(this._state)
    return result
  }

  private _persist(state: WhatsNewState): boolean {
    try {
      const temporaryPath = `${this._path}.tmp`
      mkdirSync(dirname(this._path), {recursive: true})
      writeFileSync(temporaryPath, JSON.stringify(state), {mode: 0o600})
      renameSync(temporaryPath, this._path)
      return true
    } catch (error) {
      logger.warn(logger.CONTEXT.UPDATES, "Failed to save What's New state", error)
      return false
    }
  }
}

function readState(path: string): WhatsNewState | null {
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as Partial<WhatsNewState> | null
    if (!isVersion(state?.lastVersion)) return null
    if (!Array.isArray(state.shownVersions) || !state.shownVersions.every(isVersion)) return null
    const pending = state.pendingVersion
    if (pending !== null && (pending !== state.lastVersion || state.shownVersions.includes(pending))) return null

    return {
      lastVersion: state.lastVersion,
      pendingVersion: pending,
      shownVersions: state.shownVersions,
      cachedRelease: pending && isCachedRelease(state.cachedRelease, pending) ? state.cachedRelease : null,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") logger.warn(logger.CONTEXT.UPDATES, "Failed to read What's New state", error)
    return null
  }
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(value)
}

function isCachedRelease(release: WhatsNewRelease | null | undefined, version: string): release is WhatsNewRelease {
  return (
    release?.version === version &&
    release.releaseUrl === whatsNewReleaseUrl(version) &&
    Array.isArray(release.highlights) &&
    release.highlights.length >= 1 &&
    release.highlights.length <= 3 &&
    release.highlights.every((text) => typeof text === "string" && text.trim()) &&
    Array.isArray(release.media) &&
    release.media.every(
      (item) =>
        item &&
        ["image", "gif", "video"].includes(item.kind) &&
        typeof item.label === "string" &&
        isSafeWhatsNewMediaUrl(item.url) &&
        (item.poster === undefined || isSafeWhatsNewMediaUrl(item.poster)),
    )
  )
}
