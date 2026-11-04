export enum UpdateReleaseErrorCode {
  ManifestHttpFailed = "Update manifest returned",
  InvalidManifest = "The update manifest is invalid.",
  GitHubHttpFailed = "GitHub releases API returned",
  ManifestMismatch = "The GitHub release does not match the update manifest.",
  InvalidCachePath = "The update cache path is invalid.",
}
