/**
 * Error codes thrown by the generic file downloader (downloadWithProgress)
 * — HTTP failures, missing response bodies, sha256 verification failures.
 */
export enum DownloadErrorCode {
  HttpFailed = "Download failed: HTTP",
  NoResponseBody = "Download failed: no response body",
  ChecksumMismatch = "Checksum mismatch",
}
