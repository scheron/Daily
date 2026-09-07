import {createHash} from "node:crypto"
import {createReadStream} from "node:fs"
import {mkdir, rm} from "node:fs/promises"
import path from "node:path"

import {logger} from "@daily/core"

import {electronPaths} from "@main/runtime/electronPaths"
import {downloadWithProgress} from "@main/utils/files/downloadWithProgress"
import {UPDATES_CONFIG} from "@shared/config/updates"
import {GitHubRateLimitError} from "@shared/errors/updates/GitHubRateLimitError"
import {parseGitHubReleaseMeta} from "./utils/parseGitHubReleaseMeta"

import type {AppUpdateCacheState} from "@daily/protocol"
import type {ReleaseMeta} from "@main/types/updates"

export type ReleaseLookupResult = {status: "not-modified"} | {status: "fresh"; release: ReleaseMeta; etag: string | null}

/**
 * Reads the latest release from GitHub, replaying `etag` as a conditional request.
 * A `not-modified` result means the caller's cached release is still current — GitHub
 * does not charge rate-limit budget for it.
 * @param etag ETag of the response the cached release came from, or null to fetch unconditionally.
 * @throws GitHubRateLimitError when the unauthenticated rate limit is exhausted.
 */
export async function fetchLatestRelease(etag: string | null): Promise<ReleaseLookupResult> {
  const response = await fetch(`https://api.github.com/repos/${UPDATES_CONFIG.githubRepo}/releases/latest`, {
    headers: etag ? {...UPDATES_CONFIG.githubHeaders, "If-None-Match": etag} : UPDATES_CONFIG.githubHeaders,
  })

  if (response.status === 304) return {status: "not-modified"}

  if (isRateLimited(response)) throw new GitHubRateLimitError(readRateLimitReset(response))

  if (!response.ok) {
    throw new Error(`GitHub releases API returned ${response.status} ${response.statusText}.`)
  }

  const release = parseGitHubReleaseMeta((await response.json()) as Parameters<typeof parseGitHubReleaseMeta>[0])
  if (!release) throw new Error("Failed to read GitHub release metadata.")

  return {status: "fresh", release, etag: response.headers.get("etag")}
}

export async function downloadRelease(release: ReleaseMeta, onProgress: (progress: number | null) => void): Promise<AppUpdateCacheState> {
  logger.info(logger.CONTEXT.UPDATES, `Downloading update ${release.version} via ${release.source}`)

  const releaseDir = path.join(electronPaths.updatesReleasesPath(), release.releaseId.replace(/[^a-zA-Z0-9._-]/g, "_"))
  const destinationPath = path.join(releaseDir, release.assetName)
  await mkdir(releaseDir, {recursive: true})

  await downloadWithProgress({
    url: release.assetUrl,
    destPath: destinationPath,
    onProgress: (downloadedBytes, totalBytes) => {
      const progress = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null
      onProgress(progress)
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

function isRateLimited(response: Response): boolean {
  if (response.status !== 403 && response.status !== 429) return false
  return response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")
}

function readRateLimitReset(response: Response): Date | null {
  const retryAfter = Number(response.headers.get("retry-after"))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return new Date(Date.now() + retryAfter * 1000)

  const resetAt = Number(response.headers.get("x-ratelimit-reset"))
  if (Number.isFinite(resetAt) && resetAt > 0) return new Date(resetAt * 1000)

  return null
}

async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  const stream = createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest("hex")
}
