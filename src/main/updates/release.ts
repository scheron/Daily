import {createHash} from "node:crypto"
import {createReadStream} from "node:fs"
import {mkdir, rm} from "node:fs/promises"
import path from "node:path"

import {downloadWithProgress} from "@/utils/files/downloadWithProgress"
import {logger} from "@/utils/logger"

import {APP_CONFIG, fsPaths} from "@/config"
import {parseGitHubReleaseMeta} from "./utils/parseGitHubReleaseMeta"

import type {AppUpdateCacheState} from "@shared/types/storage"
import type {ReleaseMeta} from "../types/updates"

export async function resolveLatestRelease(): Promise<ReleaseMeta> {
  const githubRelease = await getGitHubReleaseMeta()
  if (!githubRelease) throw new Error("Failed to read GitHub release metadata.")
  return githubRelease
}

export async function downloadRelease(release: ReleaseMeta, onProgress: (progress: number | null) => void): Promise<AppUpdateCacheState> {
  logger.info(logger.CONTEXT.UPDATES, `Downloading update ${release.version} via ${release.source}`)

  const releaseDir = path.join(fsPaths.updatesReleasesPath(), release.releaseId.replace(/[^a-zA-Z0-9._-]/g, "_"))
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

async function getGitHubReleaseMeta(): Promise<ReleaseMeta | null> {
  const response = await fetch(`https://api.github.com/repos/${APP_CONFIG.updates.githubRepo}/releases/latest`, {
    headers: APP_CONFIG.updates.githubHeaders,
  })

  if (!response.ok) {
    throw new Error(`GitHub releases API returned ${response.status} ${response.statusText}.`)
  }

  return parseGitHubReleaseMeta((await response.json()) as Parameters<typeof parseGitHubReleaseMeta>[0])
}

async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  const stream = createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest("hex")
}
