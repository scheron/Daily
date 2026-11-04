import {UPDATES_CONFIG} from "@shared/config/updates"

import type {ReleaseMeta} from "../types"
import type {ReleaseManifest} from "./parseReleaseManifest"

export function parseGitHubReleaseMeta(payload: unknown, manifest: ReleaseManifest): ReleaseMeta | null {
  if (!isRecord(payload) || payload.tag_name !== manifest.tag || payload.draft !== false || payload.prerelease !== false) return null
  if (!Array.isArray(payload.assets)) return null

  const release = releaseFromManifest(manifest)
  const asset: unknown = payload.assets.find((item) => isRecord(item) && item.name === release.assetName)
  if (!isRecord(asset) || asset.browser_download_url !== release.assetUrl || asset.digest !== `sha256:${release.hash}`) return null

  return release
}

export function releaseFromManifest(manifest: ReleaseManifest): ReleaseMeta {
  const {tag, version, sha256} = manifest
  const assetName = `Daily-${version}-mac.dmg`
  return {
    tag,
    source: "github",
    version,
    hash: sha256,
    releaseId: `${version}:${sha256}`,
    assetName,
    assetUrl: `https://github.com/${UPDATES_CONFIG.githubRepo}/releases/download/${tag}/${assetName}`,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object"
}
