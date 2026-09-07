export type AppUpdateSource = "brew" | "github"

/** Latest release resolved from the GitHub releases API. */
export type GitHubReleaseMeta = {
  source: "github"
  version: string
  hash: string | null
  releaseId: string
  assetName: string
  assetUrl: string
}
