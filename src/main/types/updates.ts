export type CommandResult = {
  code: number
  stdout: string
  stderr: string
  didTimeout: boolean
}

export type BrewReleaseMeta = {
  source: "brew"
  brewBinary: string
  version: string
  hash: string | null
  releaseId: string
}

export type GitHubReleaseMeta = {
  source: "github"
  version: string
  hash: string | null
  releaseId: string
  assetName: string
  assetUrl: string
}

export type ReleaseMeta = BrewReleaseMeta | GitHubReleaseMeta
