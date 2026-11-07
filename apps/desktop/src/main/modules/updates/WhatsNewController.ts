import {mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs"
import {dirname} from "node:path"

import {logger} from "@daily/core"

import {compareVersions} from "./utils/compareVersions"
import {fetchWhatsNewRelease, isSafeWhatsNewMediaUrl, whatsNewReleaseUrl} from "./whatsNewRelease"

import type {WhatsNewRelease} from "@shared/types/update"

type WhatsNewState = {
  lastVersion: string
  pendingVersion: string | null
  shownVersions: string[]
  cachedRelease: WhatsNewRelease | null
}

export class WhatsNewController {
  private state: WhatsNewState | null = null
  private load: Promise<WhatsNewRelease | null> | null = null

  constructor(
    version: string,
    private readonly path: string,
  ) {
    const previous = readState(path)
    if (previous?.lastVersion === version) {
      this.state = previous
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
    if (this.persist(state)) this.state = state
  }

  async getRelease(): Promise<WhatsNewRelease | null> {
    const state = this.state
    const version = state?.pendingVersion
    if (!version) return null

    return state.cachedRelease ?? (this.load ??= this.loadRelease(version))
  }

  markShown(version: string): boolean {
    if (!this.state || this.state.pendingVersion !== version || this.state.cachedRelease?.version !== version) return false

    const state = {
      ...this.state,
      pendingVersion: null,
      shownVersions: [...this.state.shownVersions, version],
      cachedRelease: null,
    }
    if (!this.persist(state)) return false
    this.state = state
    return true
  }

  private async loadRelease(version: string): Promise<WhatsNewRelease | null> {
    const release = await fetchWhatsNewRelease(version)
    if (!this.state || this.state.pendingVersion !== version || release?.version !== version) return null

    this.state = {...this.state, cachedRelease: release}
    this.persist(this.state)
    return release
  }

  private persist(state: WhatsNewState): boolean {
    try {
      const temporaryPath = `${this.path}.tmp`
      mkdirSync(dirname(this.path), {recursive: true})
      writeFileSync(temporaryPath, JSON.stringify(state), {mode: 0o600})
      renameSync(temporaryPath, this.path)
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
