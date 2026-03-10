import type {GitHubReleaseMeta} from "@/types/updates"

type GitHubLatestReleasePayload = {
  tag_name?: string
  assets?: Array<{
    id?: number
    name?: string
    browser_download_url?: string
    digest?: string | null
  }>
}

export function parseGitHubReleaseMeta(payload: GitHubLatestReleasePayload): GitHubReleaseMeta | null {
  const version = payload.tag_name?.replace(/^v/i, "").trim()
  const asset = payload.assets?.find((item) => typeof item.name === "string" && /-mac\.dmg$/i.test(item.name))
  if (!version || !asset?.browser_download_url || !asset.name || typeof asset.id !== "number") return null

  const hash = asset.digest?.trim() ? asset.digest.replace(/^sha256:/, "") : null
  const releaseId = hash ? `${version}:${hash}` : `${version}:asset-${asset.id}`

  return {
    source: "github",
    version,
    hash,
    releaseId,
    assetName: asset.name,
    assetUrl: asset.browser_download_url,
  }
}
