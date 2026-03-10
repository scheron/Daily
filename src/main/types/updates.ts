export type GitHubReleaseMeta = {
  source: "github"
  version: string
  hash: string | null
  releaseId: string
  assetName: string
  assetUrl: string
}

export type ReleaseMeta = GitHubReleaseMeta
