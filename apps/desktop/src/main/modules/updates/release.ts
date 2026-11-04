import {mkdir} from "node:fs/promises"
import path from "node:path"

import {logger} from "@daily/core"

import {downloadWithProgress} from "@main/utils/files/downloadWithProgress"
import {UPDATES_CONFIG} from "@shared/config/updates"
import {UpdateReleaseErrorCode} from "@shared/errors/updates/UpdateReleaseErrorCode"
import {compareVersions} from "./utils/compareVersions"
import {parseGitHubReleaseMeta} from "./utils/parseGitHubReleaseMeta"
import {parseReleaseManifest} from "./utils/parseReleaseManifest"
import {isManagedDmgPath, releaseDmgPath} from "./utils/releaseCache"

import type {AppUpdateCacheState} from "@daily/protocol"
import type {ReleaseMeta} from "./types"

export type GitHubReleaseResponse = Pick<Response, "status" | "headers" | "ok"> & {message: string | null}

type ReleaseCheckOptions = {
  currentVersion: string
  confirmedRelease: ReleaseMeta | null
  canRequestGitHub?: () => boolean
  onGitHubResponse?: (response: GitHubReleaseResponse) => void | Promise<void>
}

type ReleaseCheckResult = {kind: "current"} | {kind: "deferred"} | {kind: "available"; release: ReleaseMeta}

export async function resolveLatestRelease(options: ReleaseCheckOptions): Promise<ReleaseCheckResult> {
  const checkTimeoutMs = 15_000
  const {currentVersion, confirmedRelease, canRequestGitHub, onGitHubResponse} = options
  const response = await fetch(`https://github.com/${UPDATES_CONFIG.githubRepo}/releases/latest/download/latest.json`, {
    signal: AbortSignal.timeout(checkTimeoutMs),
  })
  if (!response.ok) throw new Error(`${UpdateReleaseErrorCode.ManifestHttpFailed} ${response.status} ${response.statusText}.`)

  const manifest = parseReleaseManifest(await response.json())
  if (!manifest) throw new Error(UpdateReleaseErrorCode.InvalidManifest)
  if (compareVersions(manifest.version, currentVersion) <= 0) return {kind: "current"}
  if (confirmedRelease?.version === manifest.version && confirmedRelease.tag === manifest.tag && confirmedRelease.hash === manifest.sha256) {
    return {kind: "available", release: confirmedRelease}
  }
  if (canRequestGitHub?.() === false) return {kind: "deferred"}

  const taggedRelease = await fetch(`https://api.github.com/repos/${UPDATES_CONFIG.githubRepo}/releases/tags/${encodeURIComponent(manifest.tag)}`, {
    headers: UPDATES_CONFIG.githubHeaders,
    redirect: "error",
    signal: AbortSignal.timeout(checkTimeoutMs),
  })
  let payload: unknown
  try {
    payload = await taggedRelease.json()
  } catch (error) {
    if (taggedRelease.ok) throw error
  } finally {
    await onGitHubResponse?.({
      ok: taggedRelease.ok,
      status: taggedRelease.status,
      headers: taggedRelease.headers,
      message: readErrorMessage(payload),
    })
  }
  if (!taggedRelease.ok) throw new Error(`${UpdateReleaseErrorCode.GitHubHttpFailed} ${taggedRelease.status} ${taggedRelease.statusText}.`)

  const release = parseGitHubReleaseMeta(payload, manifest)
  if (!release) throw new Error(UpdateReleaseErrorCode.ManifestMismatch)
  return {kind: "available", release}
}

export async function downloadRelease(release: ReleaseMeta, onProgress: (progress: number | null) => void): Promise<AppUpdateCacheState> {
  logger.info(logger.CONTEXT.UPDATES, `Downloading update ${release.version} via ${release.source}`)

  const destinationPath = releaseDmgPath(release)
  if (!(await isManagedDmgPath(destinationPath)) || !(await isManagedDmgPath(`${destinationPath}.download`))) {
    throw new Error(UpdateReleaseErrorCode.InvalidCachePath)
  }
  await mkdir(path.dirname(destinationPath), {recursive: true})

  await downloadWithProgress({
    url: release.assetUrl,
    destPath: destinationPath,
    sha256: release.hash,
    onProgress: (downloadedBytes, totalBytes, phase) => {
      if (phase === "downloading") onProgress(totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null)
    },
  })

  return {
    releaseId: release.releaseId,
    version: release.version,
    hash: release.hash,
    source: release.source,
    cachePath: destinationPath,
    downloadedAt: new Date().toISOString(),
  }
}

function readErrorMessage(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") return payload.message
  return null
}
